# Analytify decision journal

This journal records product and architecture decisions that should survive implementation details and future redesigns.

## 2026-08-09 — Use a dedicated Workspace launcher

Status: Accepted

### Context

Compare Playlists, Shared Playlists, and Song League were grouped inside the profile dropdown. That kept the primary navigation compact, but made the collaborative features hard to discover because users had to know they existed before opening account settings. Adding them to the mobile bottom navigation would make them visible, but would weaken the intentionally focused three-item bar.

### Decision

- Keep the mobile bottom bar limited to Playlists, Stats, and History.
- Add a dedicated, persistent Workspace launcher to the top application header.
- Show the word “Workspace” on wider screens and a clear grid icon on mobile and constrained desktop widths.
- Put Compare Playlists, Shared Playlists, and Song League in the Workspace panel with a short explanation of each feature.
- Keep the profile menu focused only on data and account controls.
- Continue lazy-loading every Workspace feature as a separate module.

### Consequences

Collaborative features are visible without competing with the three primary destinations. The header gains one additional control, and future collaborative tools should join this Workspace panel instead of expanding the bottom bar or returning to the profile menu.

## 2026-08-09 — Keep Song League status compact and Spotify playlists opt-in

Status: Accepted

### Context

The full-width next-pick and playlist panels made the league dashboard feel crowded. The playlist panel also described automatic Spotify behavior without giving each player an obvious action or choice.

### Decision

- Show a small “Picks open” or “Picks open again Friday” badge in the league header instead of a full next-pick panel.
- Show the recommendation composer only while that player can submit a Friday pick.
- Put one explicit playlist action directly below Active Recommendations.
- Create a private Spotify playlist only after that player chooses to enable it.
- Treat an existing playlist mapping as the opt-in signal for immediate updates, retry processing, and Friday rollover.
- Keep the existing automation rules: accepted Friday picks refresh enabled playlists, and each Friday replaces the previous week's tracks.

### Consequences

The league page stays focused on standings and recommendations, while playlist setup remains easy to discover. Players who do not want an Analytify-managed playlist receive no Spotify playlist, and enabled playlists continue updating without requiring the website to be open.

## 2026-08-15 — Replace the daily pull script with a database-configured task service

Status: Accepted

### Context

The daily pull script had grown to include credentials, allowlisting, Spotify transport, catalog normalization, every stats cadence, listening history, and playlist rollover. Changing one schedule required deployment configuration, and there was no per-user control or durable run history.

### Decision

- Run background synchronization as a task registry with one handler per reusable data purpose.
- Store per-user enablement and intervals in Supabase instead of an environment allowlist.
- Route manual and scheduled work through the same durable queue and audit trail.
- Keep service-role and Spotify client credentials exclusively in the worker.
- Reconcile administrator grants from the protected `ADMIN_SPOTIFY_IDS` GitHub secret.
- Restrict the lazy-loaded admin route in both the Angular guard and every trusted database RPC.
- Provide demo Song Leagues with synthetic bot profiles and scores only through the admin control plane.

### Consequences

Administrators can change schedules without redeploying the frontend, failures are visible per task and user, and new synchronization purposes can be added by registering a handler. The worker must remain running or be invoked frequently, and the admin migration must be applied before the page or queue can be used.

## 2026-08-15 — Deploy every pushed branch to the shared live server

Status: Accepted

### Context

Feature branches passed the complete GitHub Actions verification gate but only `main` pushes updated the Oracle server. That made an otherwise healthy branch available only through its preview deployment.

### Decision

- Deploy every successful repository `push` event, regardless of branch name, to the shared live target.
- Keep `pull_request` events verification-only so untrusted fork runs cannot access deployment secrets.
- Continue supporting manual deployment of the selected workflow branch.

### Consequences

The newest successfully deployed branch becomes the live site, so later branch deployments can replace one another even before merge. Only branches pushed by repository writers can use the protected deployment credentials.
