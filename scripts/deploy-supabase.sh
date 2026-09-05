#!/usr/bin/env bash

set -Eeuo pipefail

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Supabase deployment configuration error: ${name} is empty." >&2
    exit 1
  fi
}

require_value SUPABASE_PROJECT_REF
require_value SUPABASE_ACCESS_TOKEN
require_value SUPABASE_DB_PASSWORD
require_value SPOTIFY_CLIENT_ID
require_value SPOTIFY_CLIENT_SECRET
require_value SPOTIFY_TOKEN_ENCRYPTION_KEY
require_value WEB_PUSH_VAPID_PUBLIC_KEY
require_value WEB_PUSH_VAPID_PRIVATE_KEY

if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "Supabase deployment configuration error: SUPABASE_PROJECT_REF is invalid." >&2
  exit 1
fi

if [[ ! "$SPOTIFY_CLIENT_ID" =~ ^[A-Za-z0-9]{32}$ ]]; then
  echo "Supabase deployment configuration error: SPOTIFY_CLIENT_ID is invalid." >&2
  exit 1
fi

if [[ ! "$SPOTIFY_TOKEN_ENCRYPTION_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then
  echo "Supabase deployment configuration error: SPOTIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key." >&2
  exit 1
fi

if [[ ! "$WEB_PUSH_VAPID_PUBLIC_KEY" =~ ^[A-Za-z0-9_-]{87}$ ]]; then
  echo "Supabase deployment configuration error: WEB_PUSH_VAPID_PUBLIC_KEY is invalid." >&2
  exit 1
fi

if [[ ! "$WEB_PUSH_VAPID_PRIVATE_KEY" =~ ^[A-Za-z0-9_-]{43}$ ]]; then
  echo "Supabase deployment configuration error: WEB_PUSH_VAPID_PRIVATE_KEY is invalid." >&2
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase deployment configuration error: the Supabase CLI is unavailable." >&2
  exit 1
fi

deploy_commit_sha="${DEPLOY_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "")}"
deploy_ref="${DEPLOY_REF:-${GITHUB_REF:-refs/heads/main}}"

# Verify run represents the current protected ref before any irreversible mutation
bash "$(dirname "$0")/assert-deployment-freshness.sh" "$deploy_ref" "$deploy_commit_sha"

supabase link --project-ref "$SUPABASE_PROJECT_REF"
# Personal Spotify-app users opt in to Cloud Backup through browser-bound
# anonymous Auth users. Keep the hosted project setting aligned with that
# application contract on every deployment.
auth_config_response="$(curl --fail-with-body --silent --show-error \
  --request PATCH \
  --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  --header "Content-Type: application/json" \
  --data '{"external_anonymous_users_enabled":true}' \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth")"
if [[ "$auth_config_response" != *'"external_anonymous_users_enabled":true'* ]]; then
  echo "Supabase deployment error: anonymous Auth users were not enabled." >&2
  exit 1
fi
# Audit fixes can introduce a migration whose timestamp predates an already
# deployed hotfix. Supabase otherwise refuses that safe, pending migration.
supabase db push --include-all

if [[ -n "$deploy_commit_sha" ]]; then
  record_sql="INSERT INTO public.deployment_records (component, commit_sha, deployed_at) VALUES ('supabase', '${deploy_commit_sha}', now()) ON CONFLICT (component) DO UPDATE SET commit_sha = EXCLUDED.commit_sha, deployed_at = EXCLUDED.deployed_at;"
  curl --fail-with-body --silent --show-error \
    --request POST \
    --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "{\"query\":\"${record_sql}\"}" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" >/dev/null || true
fi
supabase secrets set \
  "SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}" \
  "SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}" \
  "SPOTIFY_TOKEN_ENCRYPTION_KEY=${SPOTIFY_TOKEN_ENCRYPTION_KEY}" \
  "WEB_PUSH_VAPID_PUBLIC_KEY=${WEB_PUSH_VAPID_PUBLIC_KEY}" \
  "WEB_PUSH_VAPID_PRIVATE_KEY=${WEB_PUSH_VAPID_PRIVATE_KEY}" \
  --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy spotify-credentials \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api
supabase functions deploy song-league-playlist-sync \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api
supabase functions deploy song-league-notifications \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${GITHUB_ENV:-}" ]]; then
  api_keys_json="$(curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys")"
  service_role_key="$(node -e 'const keys = JSON.parse(process.argv[1]); const item = keys.find(k => k.name === "service_role" || k.name === "service_role key"); if (!item?.api_key) throw new Error("service_role key not found in Supabase API keys response"); console.log(item.api_key);' "$api_keys_json")"
  echo "::add-mask::${service_role_key}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${service_role_key}" >> "$GITHUB_ENV"
fi

echo "Supabase migrations, secrets, and Edge Functions deployed successfully."
