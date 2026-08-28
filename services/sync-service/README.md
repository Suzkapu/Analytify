# Analytify sync service

This worker replaces the former monolithic `scripts/daily-pull.js`. It reads per-user task schedules from Supabase, queues due work, claims jobs, and records every result for the `/admin` page.

## Tasks

- `listening_history`
- `stats_short_term`
- `stats_medium_term`
- `stats_long_term`
- `shared_playlists`
- `song_league_playlists`

## Required runtime configuration

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_TOKEN_ENCRYPTION_KEY
ADMIN_SPOTIFY_IDS
```

`ADMIN_SPOTIFY_IDS` is a comma-separated allowlist. Production deployment writes it into `.admin-spotify-ids`. `SPOTIFY_TOKEN_ENCRYPTION_KEY` is a stable base64-encoded 32-byte AES key; deployment writes it into `.spotify-token-encryption-key`. The corresponding `*_FILE` variables can point to other protected files. `SYNC_SERVICE_POLL_SECONDS` and `SYNC_SERVICE_MAX_JOBS` are optional.

## Rollout

1. Apply `supabase/migrations/20260815120000_admin_control_plane.sql` and `20260816090000_personal_spotify_guest_access.sql`.
2. Generate one key with `openssl rand -base64 32` and add it as the `SPOTIFY_TOKEN_ENCRYPTION_KEY` GitHub Actions and Supabase Function secret.
3. Deploy both `spotify-credentials` and `song-league-playlist-sync` Edge Functions.
4. Enable Anonymous Sign-Ins in Supabase Authentication for personal-app cloud opt-in.
5. Add the `ADMIN_SPOTIFY_IDS` GitHub Actions secret.
6. Deploy and install production dependencies in this directory.
7. Stop the old daily-pull cron entry.
8. Start this service with `npm start`, or invoke `npm run once` from a frequent cron entry.

Example systemd command:

```ini
WorkingDirectory=/path/to/analytify-sync
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
```

The Supabase, Spotify, and encryption secrets must remain in protected host configuration. Personal-app Client IDs are public; Client Secrets are never accepted from users. Worker startup migrates every existing hosted plaintext refresh token into encrypted storage and clears each old value only after its encrypted write succeeds.
