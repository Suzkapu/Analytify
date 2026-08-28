# Analytify architecture

Analytify is one deployable Angular application. It uses microservice-style boundaries inside the frontend: each feature owns its pages and route module, infrastructure is isolated behind services, and shared UI has no feature-specific dependencies. This keeps the runtime simple while allowing features to evolve independently.

## Directory map

```text
src/app/
├── core/                    # Root-only infrastructure and orchestration
│   ├── auth/                # Authentication, guards, and HTTP interception
│   ├── data-access/
│   │   ├── spotify/         # Spotify API access
│   │   ├── storage/         # IndexedDB/local cache access
│   │   └── supabase/        # Supabase persistence access
│   └── sync/                # Cross-source synchronization workflows
├── features/                # Lazy-loaded vertical page slices
│   ├── auth/
│   ├── admin/              # Admin authorization and control-plane API
│   ├── insights/
│   ├── legal/
│   ├── song-league/         # Persistent Friday recommendation game
│   └── library/
├── shared/
│   ├── layout/              # Header and footer
│   └── shared.module.ts     # Common Angular and UI building blocks
├── app-routing.module.ts    # Public URL-to-feature boundaries
└── app.module.ts            # Root bootstrap only

supabase/
├── migrations/              # RLS, trusted scoring, and playlist state
└── functions/
    ├── spotify-credentials/  # Authenticated encrypted credential registration/deletion
    └── song-league-playlist-sync/ # Authenticated multi-account Spotify playlist refresh

services/
└── sync-service/           # Task registry, scheduler, Spotify workers, and queue audit
```

## Dependency rules

Dependencies point inward in one direction:

```text
features ──> shared
    │
    └──────> core ──> environments/external APIs

shared ────> core (only when shared layout needs application state)
```

- A feature must not import another feature. Move genuinely reusable UI to `shared/` and reusable infrastructure to `core/`.
- `core/data-access` services own external I/O and persistence details.
- `core/sync` services coordinate multiple data sources but do not render UI.
- Services use `providedIn: 'root'`; `CoreModule` owns only root initialization and HTTP interception.
- `CoreModule` is imported once by `AppModule`. Feature modules must never import it.
- Route modules are lazy loaded so a page is downloaded only when its URL is opened.
- Use the configured `@core`, `@features`, `@shared`, and `@env` aliases instead of fragile multi-level relative imports.
- `npm run architecture:check` enforces these dependency directions and is included in `npm run verify`.

## Background synchronization

The background worker is a separate service-role process. Its task registry isolates listening history, short-, medium-, and long-term stats, Shared Playlists, and Song League playlists. Scheduling configuration and run history live in Supabase; the Angular admin page only calls owner-checked RPCs and never receives service-role or Spotify client credentials. Refresh tokens are AES-256-GCM encrypted with a deployment secret and decrypted only in trusted worker or Edge Function memory. Hosted connections refresh with the server's confidential client, while personal PKCE connections refresh with that user's public Client ID and no Client Secret.

Manual runs and scheduled runs both enter `sync_job_runs`. A worker atomically claims queued rows, invokes the registered task, and updates `sync_task_state`, making retries and failures visible in the admin audit trail. Administrator identities are reconciled from the protected `ADMIN_SPOTIFY_IDS` deployment secret.

## Adding a page

1. Create a page folder under the closest domain in `features/`.
2. Add a small page module that declares the component and calls `RouterModule.forChild`.
3. Import `SharedModule`; import `LayoutModule` when the page uses `app-header` or `app-footer`.
4. Add one lazy `loadChildren` entry to `app-routing.module.ts`.
5. Keep feature-specific state and presentation inside the feature. Promote code only when a second feature needs it.

## Adding a service

- Spotify, Supabase, and browser-storage adapters belong in `core/data-access`.
- Authentication policy belongs in `core/auth`.
- Multi-step synchronization or cache-reconciliation workflows belong in `core/sync`.
- Prefer a narrow public API and keep transport/database shapes inside the service. Pages should request application data, not construct API calls directly.
- Register stateless services with `providedIn: 'root'`; do not add them to page-module providers unless an isolated per-page instance is intentional.

## Verification

```bash
npm run verify
```

This performs the architecture rules, playlist-share retention contract check, application type checking, test-source type checking, and the optimized production build. Use `npm run test:ci` for one headless unit-test run with coverage, or `npm run verify:ci` for the complete GitHub Actions gate. The gate runs on every push and pull request; every successful branch push deploys to the shared live server, while pull requests remain verification-only.

Product and architecture choices that constrain future changes are recorded in the [decision journal](decision-journal.md).
