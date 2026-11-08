# Backend requirements

The smart-features backend is optional. Core app features must work without it.

## Background work

- Run scheduled automatic calls in the backend, separately from the frontend.
- Use Tokio for background work and timers. Use `tokio-cron-scheduler` if calendar-style schedules are needed.
- Decide which jobs to keep and their schedules. The old worker handled history, stats, shared playlists, and Song League playlist sync.
- Design persistent schedule state, retries, rate limits, restart recovery, and duplicate prevention without requiring Supabase.
- Decide how scheduled requests work when devices are offline and what data or credentials the backend needs.

## Server endpoints and migration

- Use the optional backend for privileged operations, callbacks, and other server-only logic where needed. Check administrator authorization on the server.
- Evaluate moving the old Spotify credential, Song League sync, and notification functions to Rust server code. Supabase can still provide its database API.
- Investigate whether existing accounts, settings, history, or playlists need to be migrated. Do not modify the existing database without separate approval.

## Database

The backend storage and its responsibilities are not decided yet. It must not require Supabase for core app use.
