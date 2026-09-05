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
require_value SPOTIFY_TOKEN_ENCRYPTION_KEY

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
token_key_file="$(mktemp "${runner_temp%/}/analytify-token-encryption-key.XXXXXX")"
trap 'rm -f "$key_file" "$allowlist_file" "$token_key_file"' EXIT

printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$key_file"
chmod 600 "$key_file"

normalized_admin_ids="$(printf '%s' "$ADMIN_SPOTIFY_IDS" | tr -d '[:space:]')"
if [[ ! "$normalized_admin_ids" =~ ^[A-Za-z0-9._-]+(,[A-Za-z0-9._-]+)*$ ]]; then
  echo "Deployment configuration error: ADMIN_SPOTIFY_IDS must be a comma-separated list of Spotify user IDs." >&2
  exit 1
fi
printf '%s\n' "$normalized_admin_ids" > "$allowlist_file"
chmod 600 "$allowlist_file"

if [[ ! "$SPOTIFY_TOKEN_ENCRYPTION_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "Deployment configuration error: SPOTIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key." >&2
  exit 1
fi
printf '%s\n' "$SPOTIFY_TOKEN_ENCRYPTION_KEY" > "$token_key_file"
chmod 600 "$token_key_file"

deploy_commit_sha="${DEPLOY_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}"
deploy_ref="${DEPLOY_REF:-${GITHUB_REF:-refs/heads/main}}"

# Verify run represents the current protected ref before any irreversible mutation
bash "$(dirname "$0")/assert-deployment-freshness.sh" "$deploy_ref" "$deploy_commit_sha"

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

if [[ -n "$deploy_commit_sha" ]]; then
  if [[ -d "dist/spoti-front" ]]; then
    printf '{"commit":"%s","deployedAt":"%s"}\n' "$deploy_commit_sha" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "dist/spoti-front/version.json"
    printf '%s\n' "$deploy_commit_sha" > "dist/spoti-front/.deployed-commit"
  fi
  if [[ -d "services/sync-service" ]]; then
    printf '%s\n' "$deploy_commit_sha" > "services/sync-service/.deployed-commit"
  fi
fi

# Keep content-hashed assets from earlier releases. Already-open PWA tabs and
# service workers can request their previous CSS/JS between version discovery
# and activation; deleting those files turns a safe delayed update into a
# partially unstyled or broken page. A separate retention job may remove assets
# only after the supported rollback/cache window has elapsed.
deploy_with_retry "dist/spoti-front/" "${target_root}/" false
deploy_with_retry "services/sync-service/" "${target_root}/../analytify-sync/" false
deploy_private_file_with_retry "$allowlist_file" "${target_root}/../analytify-sync/.admin-spotify-ids"
deploy_private_file_with_retry "$token_key_file" "${target_root}/../analytify-sync/.spotify-token-encryption-key"

if [[ -n "$deploy_commit_sha" ]]; then
  echo "Verifying deployed commit SHA on Oracle Server..."
  remote_commit="$($ssh_command "${remote}" "cat ${target_root}/.deployed-commit 2>/dev/null || cat ${target_root}/../analytify-sync/.deployed-commit 2>/dev/null || true")"
  if [[ -n "$remote_commit" && "$remote_commit" != *"$deploy_commit_sha"* ]]; then
    echo "Deployment verification error: Remote commit (${remote_commit}) does not match expected (${deploy_commit_sha})." >&2
    exit 1
  fi
  echo "Remote commit verified on server: ${deploy_commit_sha}"
fi

echo "Deployment completed successfully."
