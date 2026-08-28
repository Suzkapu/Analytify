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

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase deployment configuration error: the Supabase CLI is unavailable." >&2
  exit 1
fi

supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push
supabase secrets set \
  "SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}" \
  "SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}" \
  "SPOTIFY_TOKEN_ENCRYPTION_KEY=${SPOTIFY_TOKEN_ENCRYPTION_KEY}" \
  --project-ref "$SUPABASE_PROJECT_REF"
supabase functions deploy spotify-credentials \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api
supabase functions deploy song-league-playlist-sync \
  --project-ref "$SUPABASE_PROJECT_REF" \
  --use-api

echo "Supabase migrations, secrets, and Edge Functions deployed successfully."
