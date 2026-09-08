# Contributing to Analytify

## Local setup

Use the Node version from `package.json`, then install the locked dependencies and start Angular:

```bash
npm ci
npm start
```

Register these local callbacks in the Spotify developer dashboard for the features you test:

```text
http://127.0.0.1:4200/callback
http://127.0.0.1:4200/spotify/callback
http://127.0.0.1:4200/compare-room/callback
```

The normal login uses `/callback`. Personal Spotify apps use `/spotify/callback` with Authorization Code and PKCE. Compare Room guest logins use `/compare-room/callback`.

## Tests

Run the normal verification before committing:

```bash
npm run verify
```

The CI gate also runs browser coverage and an isolated Supabase/PostgREST integration test:

```bash
npm run verify:ci
```

GitHub Actions rebuilds the complete database from migrations, runs pgTAP, checks dependency advisories and CodeQL, and deploys only the exact commit that passed every required gate.

## Supabase and background worker

Apply pending migrations and deploy the Edge Functions with the Supabase CLI. Local or production secrets must never be committed.

```bash
supabase db push
supabase functions deploy spotify-credentials
supabase functions deploy song-league-playlist-sync
supabase functions deploy song-league-notifications
```

The background worker handles independent listening-history, statistics, shared-playlist, and Song League tasks:

```bash
npm ci --prefix services/sync-service
npm run sync:once
# or
npm run sync:watch
```

See [the worker guide](services/sync-service/README.md) for configuration and rollout details. Anonymous Sign-Ins must be enabled in Supabase Authentication for personal-app users who opt into cloud-backed features.

## Project structure

The Angular application uses lazy-loaded feature slices, shared layout and UI modules, and root-only core infrastructure. See [docs/architecture.md](docs/architecture.md) before adding a page or cross-feature service.

Security problems should be reported privately as described in [SECURITY.md](SECURITY.md), not opened as public issues.
