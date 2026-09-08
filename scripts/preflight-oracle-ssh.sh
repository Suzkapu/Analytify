#!/usr/bin/env bash

set -Eeuo pipefail

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Oracle SSH preflight configuration error: ${name} is empty." >&2
    exit 1
  fi
}

require_value DEPLOY_HOST
require_value DEPLOY_USER
require_value DEPLOY_SSH_KEY
require_value DEPLOY_SSH_KNOWN_HOSTS

if [[ "$DEPLOY_HOST" == *"://"* || "$DEPLOY_HOST" == */* || "$DEPLOY_HOST" == *" "* ]]; then
  echo "Oracle SSH preflight configuration error: DEPLOY_HOST must be a hostname." >&2
  exit 1
fi
if [[ ! "$DEPLOY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]]; then
  echo "Oracle SSH preflight configuration error: DEPLOY_USER is invalid." >&2
  exit 1
fi

deploy_port="${DEPLOY_PORT:-22}"
if [[ ! "$deploy_port" =~ ^[0-9]+$ ]] || (( deploy_port < 1 || deploy_port > 65535 )); then
  echo "Oracle SSH preflight configuration error: DEPLOY_PORT must be between 1 and 65535." >&2
  exit 1
fi

runner_temp="${RUNNER_TEMP:-/tmp}"
key_file="$(mktemp "${runner_temp%/}/analytify-preflight-key.XXXXXX")"
known_hosts_file="$(mktemp "${runner_temp%/}/analytify-preflight-known-hosts.XXXXXX")"
trap 'rm -f "$key_file" "$known_hosts_file"' EXIT

printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$key_file"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" | tr -d '\r' > "$known_hosts_file"
chmod 600 "$key_file" "$known_hosts_file"

if ! ssh-keygen -l -f "$known_hosts_file" >/dev/null 2>&1; then
  echo "Oracle SSH preflight configuration error: DEPLOY_SSH_KNOWN_HOSTS is invalid." >&2
  exit 1
fi
known_host_lookup="$DEPLOY_HOST"
if [[ "$deploy_port" != "22" ]]; then
  known_host_lookup="[${DEPLOY_HOST}]:${deploy_port}"
fi
if ! ssh-keygen -F "$known_host_lookup" -f "$known_hosts_file" >/dev/null; then
  echo "Oracle SSH preflight configuration error: no pinned key exists for ${known_host_lookup}." >&2
  exit 1
fi

echo "Verifying the pinned Oracle SSH identity before any production mutation..."
ssh \
  -p "$deploy_port" \
  -i "$key_file" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=${known_hosts_file}" \
  -o GlobalKnownHostsFile=/dev/null \
  -o ConnectTimeout=20 \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  true
echo "Pinned Oracle SSH identity verified."
