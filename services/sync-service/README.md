# Analytify sync service

This worker replaces the former monolithic `scripts/daily-pull.js`. It reads per-user task schedules from Supabase, queues due work, claims jobs, and records every result for the `/admin` page.

## Tasks

- `listening_history`
- `stats_short_term`
- `stats_medium_term`
- `stats_long_term`
- `shared_playlists`
- `song_league_playlists`

Scheduled Song League playlist refreshes run only on Friday in each user's configured timezone by default. Administrators can disable the Friday-only guard per user; explicitly queued manual runs are always allowed.

Each scheduler pass also invokes the idempotent `song-league-notifications` Edge Function. It queues each league's local-Friday opening once per subscribed PWA device and delivers pending pushes without requiring a Spotify task or credential refresh.

Listening-history runs page backward from Spotify's newest recently played item to the last committed per-user high-water mark. A run processes at most 20 pages (1,000 plays); if it reaches that bound, its job details report `truncated: true` and a durable resume cursor continues the same backfill on the next run. The committed high-water mark advances only after the scan reaches its previous checkpoint, so page failures and retries cannot turn a partial scan into a permanent gap.

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

1. Generate one key with `openssl rand -base64 32` and store it as the `SPOTIFY_TOKEN_ENCRYPTION_KEY` GitHub Actions secret.
2. Add `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SPOTIFY_CLIENT_SECRET`, and `ADMIN_SPOTIFY_IDS` as protected GitHub Actions secrets.
3. Enable Anonymous Sign-Ins in Supabase Authentication for personal-app cloud opt-in.
4. Install `/etc/analytify-sync.env` on the Oracle host with the Supabase service-role and Spotify application values. The checked-in systemd unit reads this protected file.
5. Permit the deployment account to install/restart only `analytify-sync.service` through passwordless sudo.
6. Push the release. The deployment gate applies pending migrations, builds immutable web and worker directories, runs `npm ci --omit=dev` from the worker lockfile, atomically switches both `current` targets, and checks their exact commit SHA. A failed readiness check restores both prior targets.
7. Stop the old daily-pull cron entry. The deployed systemd service is now the sole long-running worker.

The deployed service binds its readiness endpoint to `127.0.0.1:8787/health` and reports the worker commit SHA, startup state, latest successful pass, and latest error. It is intentionally unavailable from the public network.

Database migrations must use expand/migrate/contract rollouts: add compatible structures first, deploy readers/writers that understand both shapes, migrate data, and remove old structures only in a later release after rollback compatibility has expired. See `docs/database-recovery.md` before any contract migration.

The Supabase, Spotify, and encryption secrets must remain in protected host configuration. Personal-app Client IDs are public; Client Secrets are never accepted from users. Worker startup migrates every existing hosted plaintext refresh token into encrypted storage and clears each old value only after its encrypted write succeeds.
