# Stats flame interaction and parity contract

Canonical component: [Ranking flame, 716:22655](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=716-22655). Canonical screens: [desktop Stats, 7:97](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=7-97) and [mobile Stats, 25:791](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd?node-id=25-791). Exact created/mutated IDs are recorded in `stats-flame-figma-ledger.json`.

## Workflow

- Trigger: current/saved rankings or comparison snapshot finish loading; classification is calculated by the existing shared Stats controller.
- Candidates: new entries and existing entries rising at least 15 places. New entries score from the first position below rank 100. Select the ten strongest candidates per song/artist category, resolving equal movement by current rank.
- Result: selected Top 10 new debuts show the blue flame; other selected candidates show the orange flame. A blue debut occupies the same ten-entry pool as an orange mover. Ordinary New/up/down/unchanged movement text stays present.
- Filtering: search narrows visibility without changing original rank, eligibility or the pool. Songs/artists maintain independent pools; genres have no flame.
- History absent: no eligibility is inferred; old classifications are cleared. Existing async Stats/snapshot behavior remains the controller’s responsibility.
- Permissions: own and approved shared views show classification from their selected ranking/comparison data. Badge has no actions or data effects and creates no playlist.
- Navigation: existing Spotify artwork and history actions stay independent. Enter/Space opens position history; Escape restores focus to the history action. Changing category removes previous category presentation.
- Accessibility: nonfocusable 18 px SVG with accessible name `Hot mover` or `Top 10 debut`; neither meaning relies solely on color. Static icon in normal/reduced motion. Orange semantic token `--v2-color-hot-mover: #ff9b54`; blue existing `--v2-color-info: #77b8ff`.
- Recovery: missing/history-changing data clears prior badges; existing loading/error/retry behavior is retained, not implemented by the badge.

## Evidence and limits

Real snapshot unit cases cover the 14/15 boundary, ties at the ten-entry cutoff, rank 10/11 debuts, category independence, original rank during filtering, and removal after history disappears. Component tests render classifications without mocking the trend calculator. Browser tests seed local IndexedDB history and mock service boundaries, then exercise filtering, categories, history keyboard actions and axe.

Geometry uses live resizing at 320/360/390/768/1024/1440/1920 px and 480/1080 px heights in Chromium, Firefox and WebKit, with normal/reduced motion. Goldens cover orange/blue rows at 390/1440 px in each engine, reviewed against the canonical badge shape/colors/placement. Missing-golden creation is a failed test until review and a subsequent unchanged run passes. Two occluded narrow screenshots were rejected and recaptured after scrolling the real row into view.

This verifies the badge slice. Full Stats parity is unfinished: artist rows now adopt canonical artwork/action geometry but page gutters, border token and compact captions remain unresolved; native song artwork-button surfaces vary by engine, and rank-history renders a list instead of the chart. These snapshots must not be treated as approved whole-page Figma parity. Other async, permission, shared-view and recovery cases remain in the overall plan.
