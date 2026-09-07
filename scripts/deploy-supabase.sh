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
token_keys_json="${SPOTIFY_TOKEN_ENCRYPTION_KEYS:-{\"1\":\"${SPOTIFY_TOKEN_ENCRYPTION_KEY}\"}}"
token_write_version="${SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION:-1}"
node -e 'const ring=JSON.parse(process.argv[1]); const version=process.argv[2]; if (!Number.isInteger(Number(version)) || !ring[version]) throw new Error("active Spotify token key is missing from key ring"); for (const value of Object.values(ring)) if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("invalid Spotify token key ring");' "$token_keys_json" "$token_write_version"

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
if [[ ! "$deploy_commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Supabase deployment configuration error: DEPLOY_COMMIT_SHA must be a full Git commit SHA." >&2
  exit 1
fi
deploy_ref="${DEPLOY_REF:-${GITHUB_REF:-refs/heads/main}}"
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
supabase secrets set \
  "SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}" \
  "SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}" \
  "SPOTIFY_TOKEN_ENCRYPTION_KEY=${SPOTIFY_TOKEN_ENCRYPTION_KEY}" \
  "SPOTIFY_TOKEN_ENCRYPTION_KEYS=${token_keys_json}" \
  "SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION=${token_write_version}" \
  "DEPLOYMENT_COMMIT_SHA=${deploy_commit_sha}" \
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

deployment_revision_sql="insert into public.deployment_revisions(component, commit_sha, deployed_at) values ('supabase', '${deploy_commit_sha}', now()), ('edge:spotify-credentials', '${deploy_commit_sha}', now()), ('edge:song-league-playlist-sync', '${deploy_commit_sha}', now()), ('edge:song-league-notifications', '${deploy_commit_sha}', now()) on conflict (component) do update set commit_sha = excluded.commit_sha, deployed_at = excluded.deployed_at;"
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$(node -e 'process.stdout.write(JSON.stringify({query: process.argv[1]}))' "$deployment_revision_sql")" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" >/dev/null

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${GITHUB_ENV:-}" ]]; then
  api_keys_json="$(curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys")"
  service_role_key="$(node -e 'const keys = JSON.parse(process.argv[1]); const item = keys.find(k => k.name === "service_role" || k.name === "service_role key"); if (!item?.api_key) throw new Error("service_role key not found in Supabase API keys response"); console.log(item.api_key);' "$api_keys_json")"
  echo "::add-mask::${service_role_key}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${service_role_key}" >> "$GITHUB_ENV"
fi

echo "Supabase migrations, secrets, and Edge Functions deployed successfully."
