#!/usr/bin/env bash

set -Eeuo pipefail

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Deployment configuration error: ${name} is empty." >&2
    exit 1
  fi
}

require_value DEPLOY_HOST
require_value DEPLOY_USER
require_value DEPLOY_TARGET
require_value DEPLOY_SSH_KEY
require_value ADMIN_SPOTIFY_IDS

if [[ "$DEPLOY_HOST" == *"://"* || "$DEPLOY_HOST" == */* || "$DEPLOY_HOST" == *" "* ]]; then
  echo "Deployment configuration error: DEPLOY_HOST must be a hostname without a scheme, path, or spaces." >&2
  exit 1
fi

deploy_port="${DEPLOY_PORT:-22}"
if [[ ! "$deploy_port" =~ ^[0-9]+$ ]] || (( deploy_port < 1 || deploy_port > 65535 )); then
  echo "Deployment configuration error: DEPLOY_PORT must be between 1 and 65535." >&2
  exit 1
fi

runner_temp="${RUNNER_TEMP:-/tmp}"
key_file="$(mktemp "${runner_temp%/}/analytify-deploy-key.XXXXXX")"
allowlist_file="$(mktemp "${runner_temp%/}/analytify-admin-spotify-ids.XXXXXX")"
trap 'rm -f "$key_file" "$allowlist_file"' EXIT

printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$key_file"
chmod 600 "$key_file"

normalized_admin_ids="$(printf '%s' "$ADMIN_SPOTIFY_IDS" | tr -d '[:space:]')"
if [[ ! "$normalized_admin_ids" =~ ^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$ ]]; then
  echo "Deployment configuration error: ADMIN_SPOTIFY_IDS must be a comma-separated list of Spotify user IDs." >&2
  exit 1
fi
printf '%s\n' "$normalized_admin_ids" > "$allowlist_file"
chmod 600 "$allowlist_file"

ssh_command="ssh -p ${deploy_port} -i ${key_file} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3"
remote="${DEPLOY_USER}@${DEPLOY_HOST}"
target_root="${DEPLOY_TARGET%/}"

deploy_with_retry() {
  local source="$1"
  local target="$2"
  local delete_stale_files="$3"
  local attempt
  local -a args=(
    --recursive
    --links
    --times
    --compress
    --human-readable
    --itemize-changes
    --exclude=/node_modules/
    --rsh="$ssh_command"
  )

  if [[ "$delete_stale_files" == "true" ]]; then
    args+=(--delete)
  fi

  for attempt in 1 2 3; do
    echo "Deploying ${source} to ${DEPLOY_HOST} (attempt ${attempt}/3)..."
    if rsync "${args[@]}" "$source" "${remote}:${target}"; then
      return 0
    fi

    if (( attempt < 3 )); then
      echo "Deployment attempt ${attempt} failed; retrying after $((attempt * 10)) seconds..." >&2
      sleep "$((attempt * 10))"
    fi
  done

  echo "Deployment failed after 3 attempts: ${source}" >&2
  return 1
}

deploy_private_file_with_retry() {
  local source="$1"
  local target="$2"
  local attempt
  local -a args=(
    --times
    --perms
    --compress
    --human-readable
    --itemize-changes
    --chmod=F600
    --rsh="$ssh_command"
  )

  for attempt in 1 2 3; do
    echo "Deploying protected admin configuration to ${DEPLOY_HOST} (attempt ${attempt}/3)..."
    if rsync "${args[@]}" "$source" "${remote}:${target}"; then
      return 0
    fi

    if (( attempt < 3 )); then
      echo "Protected configuration deployment failed; retrying after $((attempt * 10)) seconds..." >&2
      sleep "$((attempt * 10))"
    fi
  done

  echo "Protected admin configuration deployment failed after 3 attempts." >&2
  return 1
}

deploy_with_retry "dist/spoti-front/" "${target_root}/" true
deploy_with_retry "services/sync-service/" "${target_root}/../analytify-sync/" false
deploy_private_file_with_retry "$allowlist_file" "${target_root}/../analytify-sync/.admin-spotify-ids"

echo "Deployment completed successfully."
