# Existing website features missing or incomplete in Design v2

Audit date: 5 October 2026. Repository: `codex/design-v2`, commit `de3d5b5`.

Compared the existing Angular templates and controllers, Git history, the `/new` components, and the canonical desktop/mobile screens in [the Figma file](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=7-2). QA copies and archived design sections were excluded. This is a source/design audit, not a claim that every runtime interaction has been browser-tested.

“Missing design” means no corresponding control/state was found in the inspected canonical screens. “Partial design” means the screen exists but does not specify the actual existing behavior. “Implementation gap” means Figma already contains the feature, but the new website does not render it. Findings below are evidence-based; missing words alone were not treated as proof of missing functionality.

## Findings

### 1. Orange flames for hot-moving songs and artists

**Status: missing design and `/new` implementation. Priority: high.**

The existing Stats controller calculates hot movers for both categories. Existing entries qualify after rising at least 15 places; new entries also enter the candidate pool. Candidates are scored by movement and limited to ten per category, with current rank breaking ties. This is more specific than showing a flame on every upward movement.

- Logic: [user-stats.component.ts](../src/app/features/insights/user-stats/user-stats.component.ts), `calculateHotMovers()` around line 1198 and `isHotMover()` around line 1250.
- Existing rendering: [user-stats.component.html](../src/app/features/insights/user-stats/user-stats.component.html), song flames around line 310 and artist flames around line 456.
- New rendering: [v2-user-stats.component.ts](../src/app/features/insights/user-stats/v2-user-stats.component.ts), song/artist rows around lines 52–61, never calls the hot-mover predicates.
- Figma: [Stats](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=7-97) shows movement text but no equivalent flame state was found.

Design both row and artist-card variants, including accessible labels and a reduced-motion treatment. Test the 14/15-place boundary, ten-entry limit, ties, missing history, and separate song/artist pools.

### 2. Blue flames for high new debuts

**Status: missing design and `/new` implementation. Priority: high.**

New songs/artists entering the Top 10 receive the blue debut treatment when selected into the same hot-mover pool. They are not a second independent set of ten. The existing styling distinguishes blue debuts from orange movers.

- Logic: `highDebutRankLimit`, `isHighDebutSong()` and `isHighDebutArtist()` in [user-stats.component.ts](../src/app/features/insights/user-stats/user-stats.component.ts), around lines 114 and 1261.
- Styling: [user-stats.component.scss](../src/app/features/insights/user-stats/user-stats.component.scss), `hot-mover` and blue flame animation.
- Git evidence: commit `4b3f372` — “highlight high new song debuts”.

Add blue/orange variants to the same shared design component. Test new entry at rank 10 versus 11, candidate prioritization, and the accessible distinction between debut and rise.

### 3. Rank-history charts: category-specific ranges and inspection

**Status: partial design, plus a confirmed `/new` implementation gap. Priority: high.**

The graph itself is already designed, so it is not an entirely missing GUI. However, the inspected [chart component](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=347-17892) uses `#1 / #8 / #15` axes in its variants. Existing behavior uses song ranks `#1 / #50 / #100`, artist ranks `#1 / #25 / #50`, and genre ranks `#1 / #8 / #15`.

The existing graph also reveals point rank/date on hover, limits labels for dense histories, and explains insufficient history when fewer than two points exist. Corresponding loading/insufficient-history/dense-data interaction specifications were not established by the inspected static graph examples.

- Source: [user-stats.component.html](../src/app/features/insights/user-stats/user-stats.component.html), around lines 667–738; label selection in [user-stats.component.ts](../src/app/features/insights/user-stats/user-stats.component.ts).
- `/new`: [v2-user-stats.component.ts](../src/app/features/insights/user-stats/v2-user-stats.component.ts), line 74, renders an ordered date/rank list instead of the designed graph.

Specify category ranges, point inspection, dense histories, loading and insufficient-history states. Test chart data and coordinate calculation separately from browser checks for hover, focus, narrow widths and popup scrolling.

### 4. Admin per-task schedule policy editor

**Status: partial design. Priority: medium.**

The Operations design contains a “Schedule limits” description and Save control. The website has an editable row per task, a listening-history availability toggle, numeric minimum interval, minutes/hours/days unit, and per-row saving state.

- Source: [admin.component.html](../src/app/features/admin/admin.component.html), lines 71–81.
- Design: [Operations](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=27-1429).

Design actual policy rows, validation and saving feedback. Keep site-wide policy limits distinct from an individual user's schedule preferences.

### 5. Admin user schedules and recent runs need their real data states

**Status: partial design. Priority: medium.**

[Users and runs](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=27-1461) includes task names and interval examples, but describes recent runs using generic text. Existing user cards also show last successful run, next effective automatic run, retained manual-job status, last error and required-feature restrictions. Recent runs expose actual task/status/time/error records.

- Source: [admin.component.html](../src/app/features/admin/admin.component.html), user schedule/status area around lines 140–220 and the recent-run section.

Design user identification and expanded schedule rows, actual run records, required/optional restrictions, and success/failure/running/empty states. Test that saving one user's schedule does not affect another and that feature-required tasks cannot be disabled.

### 6. Moderation case receipts and decision states

**Status: partial design. Priority: medium.**

[Reports and decisions](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=27-906) already includes an appeal form, but its case list is represented by “Show status, decision reason and any appeal deadline.” The website displays individual receipt codes, status pills, recipient-specific notices and decision reasons; appeal availability depends on viewer role, resolution and whether an appeal was already submitted.

- Source: [shared-playlists.component.html](../src/app/features/shared-playlists/shared-playlists.component.html), lines 248–276.

Design concrete case cards and affected-user/reporter variants, including already-appealed and unavailable-action states. The appeal feature itself is present in Figma; its surrounding stateful UI is incomplete.

### 7. Admin review of an existing appeal

**Status: partial design. Priority: medium.**

The admin Report inbox design provides review fields and notices, but does not show the submitted appeal reason that the existing website presents before the decision controls.

- Source: [admin.component.html](../src/app/features/admin/admin.component.html), line 103, `report.appealReason`.
- Design: [Report inbox](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=27-1509).

Add an appealed-case context panel with the user's submitted reason, alongside the existing review controls. Test original report versus appealed report and long reason text.

### 8. Reconnecting Spotify with a saved or replacement app

**Status: partial design. Priority: high.**

The existing connection page supports leaving Client ID empty to use the app saved for a verified Spotify ID, or supplying a replacement Client ID after deleting an app. For authenticated users it explains that Spotify must return the same account and that existing cloud data remains untouched.

- Source: [personal-spotify-connect.component.html](../src/app/features/auth/personal-spotify/personal-spotify-connect.component.html), lines 46–60.
- Design: [Spotify details](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=249-14584) specifies initial setup with a 32-character Client ID, but not the saved-app/reconnection distinction.

Design initial setup and reconnect variants, optional Client ID messaging and account-mismatch feedback. Avoid applying the initial-setup required-field rule to reconnecting users.

### 9. League lifecycle audit history

**Status: partial design, not a completely missing section. Priority: medium.**

The inspected [League overview](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=25-681) includes “League activity” with a sample new-pick message. The existing lifecycle history records different events: member left, member removed, ownership transferred and league closed, each with actor/subject context and occurrence time. Closed leagues preserve this history read-only.

- Source: [song-league-detail.component.html](../src/app/features/song-league/song-league-detail.component.html), lines 390–398; `lifecycleLabel()` in [song-league-detail.component.ts](../src/app/features/song-league/song-league-detail.component.ts), around line 502.

Extend the activity design with these lifecycle event types and loading/read-only states. A pick-submission sample does not specify lifecycle audit records.

### 10. Shared playlist Stats view is still a placeholder

**Status: partial design. Priority: high.**

The shared snapshot screen contains a “Stats view” heading followed by a description of what should be shown. The existing website actually renders five metric cards (songs, artists, albums, duration and explicit tracks), plus separate top-artist and top-album lists with counts. The normal playlist Analysis design does not automatically specify this shared-snapshot state.

- Source: [shared-playlist-detail.component.html](../src/app/features/shared-playlists/shared-playlist-detail.component.html), lines 103–124.
- Designs: [desktop shared snapshot](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=27-930) and [mobile shared snapshot](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=35-1578); both contain the descriptive placeholder.

Compose this view using the existing analysis components, with real metric values and ranked lists. Specify empty lists, long artist/album names and narrow-width wrapping. Test that every metric is calculated from the selected shared snapshot rather than the viewer's own playlist.

### 11. Shared Spotify copy: current-version and automatic-update states

**Status: partial design. Priority: medium.**

The snapshot design already has Add, Update and Retry controls and a version label. However, the website also distinguishes an already-current copy from one needing an update, disables updates while songs are still loading or failed to load, reports successful automatic updates, and explains that the saved copy updates while the user is logged in. Those states were not found in the inspected desktop/mobile snapshot designs.

- Source: [shared-playlist-detail.component.html](../src/app/features/shared-playlists/shared-playlist-detail.component.html), lines 32–69; `hasUpdate`, `downloadButtonLabel` and automatic-update messages in [shared-playlist-detail.component.ts](../src/app/features/shared-playlists/shared-playlist-detail.component.ts), around lines 272–337.
- Designs: [desktop](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=27-930) and [mobile](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=35-1578).

Add current-copy, loading, updating and automatically-updated variants. Preserve the same Spotify copy when retrying or refreshing. Test revision changes, disabled actions during incomplete loading, and repeated updates without duplicate playlist creation.

## Intentional exclusions

Blocked-user management was intentionally removed from the redesign. The user clarified that the underlying opportunity to spam other users was systematically removed, so restoring a blocked-user list or unblock flow is not a design requirement. Residual blocked-user code does not make this a missing GUI feature.

Runtime health is also intentionally excluded. The user clarified that it was never operational and is unnecessary; its residual code is not a requirement to create or restore a GUI.

## Existing designs that must not be mistaken for missing features

The inspected canonical screens already cover playlist analysis totals and oldest/newest/shortest/longest songs; playlist artist/album browsing; album-specific song views; historical Stats search; ordinary New/up/down/unchanged movement; shared playlist copying/updating/retry; compare-room invitations and QR joining; league recommendations, standings, member management and lifecycle actions; notification settings; automatic-update interval editing; and Cloud Backup confirmation. The follow-up also verified that comparison results include contribution counts and approval waiting, comparison recovery includes retrying the same playlist, and mobile listening history includes explicit-track information. These were not added as missing features.

Their existence in Figma does **not** establish complete implementation or coverage of every data state. Conversely, changes in navigation or replacing a calendar with an equivalent date selector are not automatically missing functionality.

## Reliability of previous parity documentation

[design-v2-ui-parity-matrix.md](design-v2-ui-parity-matrix.md), row E2, labels “hot/new” and the trend modal Complete. The current `/new` template has no hot-mover rendering and uses a list instead of a graph. Treat that row as historical evidence requiring re-verification, not proof that these gaps are closed.

## Recommended next order

1. Protect the existing hot-mover/debut and reconnect logic with regression checks before changing their presentation.
2. Add the missing orange/blue flame components and states to Figma.
3. Complete chart, reconnect, lifecycle and moderation specifications using realistic data.
4. Complete shared-snapshot Stats and copy-update states; replace the remaining admin schedule/run descriptions with concrete controls and state variants.
5. Implement from those designs and verify behavior, responsive layouts, keyboard interaction and visual regressions. Mark each finding resolved only with both design and implementation evidence.

No features, Figma nodes, production services or deployments were changed by this audit.
