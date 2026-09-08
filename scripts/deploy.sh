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
require_value DEPLOY_SSH_KNOWN_HOSTS
require_value WORKER_ARTIFACT_DIR
require_value ADMIN_SPOTIFY_IDS
require_value SPOTIFY_TOKEN_ENCRYPTION_KEY
require_value SUPABASE_URL
require_value SUPABASE_SERVICE_ROLE_KEY
require_value SPOTIFY_CLIENT_ID
require_value SPOTIFY_CLIENT_SECRET

if [[ ! "$DEPLOY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]]; then
  echo "Deployment configuration error: DEPLOY_USER is invalid." >&2
  exit 1
fi
if [[ ! "$DEPLOY_TARGET" =~ ^/[A-Za-z0-9._/-]+$ ]] || [[ "$DEPLOY_TARGET" == *".."* ]]; then
  echo "Deployment configuration error: DEPLOY_TARGET must be a normalized absolute path." >&2
  exit 1
fi

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
known_hosts_file="$(mktemp "${runner_temp%/}/analytify-known-hosts.XXXXXX")"
allowlist_file="$(mktemp "${runner_temp%/}/analytify-admin-spotify-ids.XXXXXX")"
token_key_file="$(mktemp "${runner_temp%/}/analytify-token-encryption-key.XXXXXX")"
token_keys_file="$(mktemp "${runner_temp%/}/analytify-token-encryption-keys.XXXXXX")"
service_file="$(mktemp "${runner_temp%/}/analytify-sync-service.XXXXXX")"
worker_environment_file="$(mktemp "${runner_temp%/}/analytify-sync-environment.XXXXXX")"
trap 'rm -f "$key_file" "$known_hosts_file" "$allowlist_file" "$token_key_file" "$token_keys_file" "$service_file" "$worker_environment_file"' EXIT

printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$key_file"
chmod 600 "$key_file"

printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" | tr -d '\r' > "$known_hosts_file"
chmod 600 "$known_hosts_file"
if ! ssh-keygen -l -f "$known_hosts_file" >/dev/null 2>&1; then
  echo "Deployment configuration error: DEPLOY_SSH_KNOWN_HOSTS is not a valid known_hosts file." >&2
  exit 1
fi
known_host_lookup="$DEPLOY_HOST"
if [[ "$deploy_port" != "22" ]]; then
  known_host_lookup="[${DEPLOY_HOST}]:${deploy_port}"
fi
if ! ssh-keygen -F "$known_host_lookup" -f "$known_hosts_file" >/dev/null; then
  echo "Deployment configuration error: no pinned SSH key exists for ${known_host_lookup}." >&2
  exit 1
fi

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
token_keys_json="${SPOTIFY_TOKEN_ENCRYPTION_KEYS:-{\"1\":\"${SPOTIFY_TOKEN_ENCRYPTION_KEY}\"}}"
token_write_version="${SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION:-1}"
node -e 'const ring=JSON.parse(process.argv[1]); const version=process.argv[2]; if (!Number.isInteger(Number(version)) || !ring[version]) throw new Error("active Spotify token key is missing from key ring"); for (const value of Object.values(ring)) if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("invalid Spotify token key ring");' "$token_keys_json" "$token_write_version"
printf '%s\n' "$token_keys_json" > "$token_keys_file"
chmod 600 "$token_keys_file"

if [[ ! "$SUPABASE_URL" =~ ^https://[a-z0-9.-]+$ ]] || [[ ! "$SPOTIFY_CLIENT_ID" =~ ^[A-Za-z0-9]{32}$ ]]; then
  echo "Deployment configuration error: worker public configuration is invalid." >&2
  exit 1
fi
printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nSPOTIFY_CLIENT_ID=%s\nSPOTIFY_CLIENT_SECRET=%s\nSPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION=%s\n' \
  "$SUPABASE_URL" "$SUPABASE_SERVICE_ROLE_KEY" "$SPOTIFY_CLIENT_ID" "$SPOTIFY_CLIENT_SECRET" "$token_write_version" \
  > "$worker_environment_file"
chmod 600 "$worker_environment_file"

deploy_commit_sha="${DEPLOY_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}"
if [[ ! "$deploy_commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Deployment configuration error: DEPLOY_COMMIT_SHA must be a full Git commit SHA." >&2
  exit 1
fi
deploy_ref="${DEPLOY_REF:-${GITHUB_REF:-refs/heads/main}}"
bash "$(dirname "$0")/assert-deployment-freshness.sh" "$deploy_ref" "$deploy_commit_sha"
worker_artifact_dir="${WORKER_ARTIFACT_DIR%/}"
if [[ ! -d "$worker_artifact_dir/node_modules" || ! -f "$worker_artifact_dir/package-lock.json" ]]; then
  echo "Deployment configuration error: WORKER_ARTIFACT_DIR is not an assembled worker runtime." >&2
  exit 1
fi
worker_artifact_commit="$(tr -d '[:space:]' < "$worker_artifact_dir/.deployed-commit" 2>/dev/null || true)"
if [[ "$worker_artifact_commit" != "$deploy_commit_sha" ]]; then
  echo "Deployment configuration error: worker artifact commit does not match DEPLOY_COMMIT_SHA." >&2
  exit 1
fi
ssh_command="ssh -p ${deploy_port} -i ${key_file} -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${known_hosts_file} -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3"
remote="${DEPLOY_USER}@${DEPLOY_HOST}"
target_root="${DEPLOY_TARGET%/}"
release_root="$(dirname "${target_root}")/analytify-releases"
web_release="${release_root}/web-${deploy_commit_sha}"
worker_root="/var/lib/analytify-sync"
worker_release="${worker_root}/releases/${deploy_commit_sha}"
worker_current="${worker_root}/current"

remote_command_with_retry() {
  local command="$1"
  local attempt
  for attempt in 1 2 3; do
    if $ssh_command "$remote" "$command"; then return 0; fi
    if (( attempt < 3 )); then
      echo "Remote command failed; retrying after $((attempt * 5)) seconds..." >&2
      sleep "$((attempt * 5))"
    fi
  done
  echo "Remote command failed after 3 attempts." >&2
  return 1
}

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
fi

echo "Preparing immutable release directories on Oracle Server..."
remote_command_with_retry "mkdir -p '${web_release}' && sudo -n install -d -o '${DEPLOY_USER}' -m 0750 '${worker_root}' '${worker_root}/releases'"
deploy_with_retry "dist/spoti-front/" "${web_release}/" true
deploy_with_retry "${worker_artifact_dir}/" "${worker_release}/" true
deploy_private_file_with_retry "$allowlist_file" "${worker_root}/.admin-spotify-ids"
deploy_private_file_with_retry "$token_key_file" "${worker_root}/.spotify-token-encryption-key"
deploy_private_file_with_retry "$token_keys_file" "${worker_root}/.spotify-token-encryption-keys"
deploy_private_file_with_retry "deploy/analytify-security.conf" "${worker_root}/.analytify-nginx-security-${deploy_commit_sha}.conf"
deploy_with_retry "scripts/install-nginx-security.sh" "${worker_root}/install-nginx-security.sh" false
deploy_with_retry "scripts/inject-nginx-security-include.mjs" "${worker_root}/inject-nginx-security-include.mjs" false

echo "Installing and syntax-checking the versioned nginx security policy..."
remote_command_with_retry "chmod 700 '${worker_root}/install-nginx-security.sh' && '${worker_root}/install-nginx-security.sh' '${worker_root}/.analytify-nginx-security-${deploy_commit_sha}.conf'"

sed \
  -e "s|@@DEPLOY_USER@@|${DEPLOY_USER}|g" \
  -e "s|@@WORKER_CURRENT@@|${worker_current}|g" \
  -e "s|@@WORKER_ROOT@@|${worker_root}|g" \
  deploy/analytify-sync.service.template > "$service_file"
deploy_private_file_with_retry "$service_file" "${worker_root}/.analytify-sync.service-${deploy_commit_sha}"
deploy_private_file_with_retry "$worker_environment_file" "${worker_root}/.analytify-sync.env-${deploy_commit_sha}"
deploy_with_retry "scripts/activate-release.sh" "${worker_root}/activate-release.sh" false
remote_command_with_retry "chmod 700 '${worker_root}/activate-release.sh' && sudo -n install -o root -g root -m 0644 '${worker_root}/.analytify-sync.service-${deploy_commit_sha}' /etc/systemd/system/analytify-sync.service && sudo -n install -o root -g root -m 0600 '${worker_root}/.analytify-sync.env-${deploy_commit_sha}' /etc/analytify-sync.env"

echo "Atomically activating and health-checking the web and worker releases..."
remote_command_with_retry "'${worker_root}/activate-release.sh' '${web_release}' '${target_root}' '${worker_release}' '${worker_root}' '${deploy_commit_sha}' 'https://${DEPLOY_HOST}' 8787"

if [[ -n "$deploy_commit_sha" ]]; then
  echo "Verifying deployed commit SHA on Oracle Server..."
  remote_commit="$(remote_command_with_retry "cat '${target_root}/.deployed-commit' 2>/dev/null && cat '${worker_current}/.deployed-commit' 2>/dev/null")"
  if [[ -n "$remote_commit" && "$remote_commit" != *"$deploy_commit_sha"* ]]; then
    echo "Deployment verification error: Remote commit (${remote_commit}) does not match expected (${deploy_commit_sha})." >&2
    exit 1
  fi
  echo "Remote commit verified on server: ${deploy_commit_sha}"
fi
echo "Deployment completed successfully."
