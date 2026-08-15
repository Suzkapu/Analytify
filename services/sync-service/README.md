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
ADMIN_SPOTIFY_IDS
```

`ADMIN_SPOTIFY_IDS` is a comma-separated allowlist. Production deployment writes the GitHub Actions secret into `.admin-spotify-ids`; `ADMIN_SPOTIFY_IDS_FILE` can point to a different protected file. `SYNC_SERVICE_POLL_SECONDS` and `SYNC_SERVICE_MAX_JOBS` are optional.

## Rollout

1. Apply `supabase/migrations/20260815120000_admin_control_plane.sql`.
2. Add the `ADMIN_SPOTIFY_IDS` GitHub Actions secret.
3. Deploy and install production dependencies in this directory.
4. Stop the old daily-pull cron entry.
5. Start this service with `npm start`, or invoke `npm run once` from a frequent cron entry.

Example systemd command:

```ini
WorkingDirectory=/path/to/analytify-sync
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
```

The Supabase and Spotify secrets should be supplied by the host's protected environment file. They must never be copied into the Angular environment or Git repository.
