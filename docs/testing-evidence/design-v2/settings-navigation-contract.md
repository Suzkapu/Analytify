# Settings navigation implementation contract

Checkpoint: `1dbd16a`, development branch `codex/design-v2`, 10 October 2026.

Fresh canonical design context and screenshots were inspected for Account
`27:1209` / `35:1868` and Data `90:4895` / `90:4902`. Shared section navigation
is `218:11685`; destination rows are `227:11961`. Full text context, component
descriptions and actual prototype reactions are preserved in
`settings-navigation-canonical-context-2026-10-10.json`.

The reusable Angular components supply native route links rather than changing
an independent selected-tab signal. The router supplies exactly one current
page. Query parameters, fragments and matrix parameters do not change which
section is selected; paths must match exactly. Ordinary browser keyboard and
modified-click link behavior are retained. Desktop labels remain beside icons;
mobile labels stack underneath, with Notifications displayed as Alerts while
retaining its accessible name. The Navigation destination occupies a full
mobile row and is hidden on desktop. Semantic tokens supply colors, spacing,
focus and borders; reduced motion removes decorative transitions.

Destination rows wrap their text and use a full native link target. Actual
Figma reactions confirm that Spotify connection opens
`https://www.spotify.com/account/apps/` in a new tab, with opener/referrer
protection. Legal opens the legal route. The Settings profile and all Data
mutation workflows will be composed separately with protected actions. Icons
are supplied as local URLs by the consuming page; the chevron reuses the exact
PrimeIcons glyph documented by the canonical component. Test icon URLs are
fixtures, not the final Settings icon mapping.

Baseline: five component tests fail against the empty render. First working
implementation passes five tests. A sixth case reproduces a missing current
indicator when the Account URL has query/fragment state, then passes after
router matching is corrected. The final focused run includes six navigation
cases and the existing primitives/shell regressions: 102 passed across three
files. No release/security or coverage gates changed.

## Remaining integration and design work

These components are not yet mounted into a production Settings route. Native
browser geometry, keyboard and screenshot parity remain unverified until the
page is composed. Unit DOM tests do not prove responsive CSS behavior. No
temporary Figma asset URL is referenced by application code.

Fresh context for Notifications `27:1234` / `35:1896`, Updates `44:1757` /
`7:312`, Navigation `688:41515`, Cloud Backup `27:1307` and chooser `27:1323`
is preserved separately. The canonical chooser has three scopes, including
anonymous-account deletion; the existing popup only has two choices plus a
guest logout prompt. It must be migrated as an actual workflow.

The canonical Notifications page separates device permission/subscription
from saved categories. The current PushNotificationService exposes category
setters that request/register a subscription before saving an enabled
category; it has no independent device-enable public method. Composing the
legacy dialog would miss this designed workflow. Characterize the permission,
registration, denial/recovery and category-preservation boundary before adding
the separate device action. Never send notifications or query production data
for these tests.

The provisional sidebar animation is unchanged. The earlier native DOM-update
timeout remains unresolved. Overall Settings and migration completion gates
remain open.

## Composition and independent device action — 10 October 2026

Saved checkpoint `366fa00` adds the Account/Data route and an injected shared
account-action boundary. Settings panels resolve the existing shell controller:
profile changes, logout, consent, errors and busy state remain shared. Four new
integration cases exercise real shell composition rather than replacing it with
an action mock. Two boundary tests cover consent opening and busy refusal.

The page remains incomplete: Notifications/Updates/Navigation are pending, the
Data switch is still a native checkbox presentation, and backup/clear-data still
open retained shell prompts instead of the full canonical destinations. These
are explicit migration gaps, not approved replacements for the design.

`PushNotificationService.enableDevice()` now shares the existing permission,
subscription and registration recovery path with category setters, then reloads
saved settings without writing a category. Six new cases first failed because
this public action was absent (14 existing cases passed). After implementation,
96 service/dialog/shell cases passed. Device registration failure is retryable;
denied/unsupported states make no server writes, late subscription publication
is reconciled, and saved disabled categories remain disabled. All RPCs in these
tests are isolated fakes; no notification delivery or production data is used.

Full checks initially exposed forbidden shared-to-feature test imports, then
required colocated specs. Tests were moved/split under their owning feature and
boundary sources; neither gate was changed. Final regression and native runtime
results are recorded in the progress log after their terminal outcomes.

## Notifications page state contract — 10 October 2026

Fresh high-fidelity canonical desktop27:1234/mobile35:1896 context and screenshots
confirm separate device setup and saved categories. Full text handoff is in
`settings-notification-canonical-context-2026-10-10.json`.

The new preference-only service action writes one category then reads settings
without the legacy automatic device-registration side effect. Existing category
setters and legacy dialog behavior remain protected. Device enabling is a
separate operation; neither new action delivers a notification. Unsupported or
denied device permission does not prevent saving a category preference. An
existing browser subscription must not be registered implicitly by that save.

The page controller retains cached preferences during refresh/failure, accepts
only the newest refresh, blocks duplicate mutations and refresh during saving,
and publishes completion only for the captured Spotify actor/session and live
controller. Stale account/session completion clears retained settings so a new
account can reload; destroyed controllers reject further operations. Failed
category saving keeps the last authoritative settings and allows retry. No
optimistic toggle is certified as persisted before the service succeeds.

This controller is not yet mounted. Complete the canonical loading/ready/denied/
unsupported/error/recovery states, full install instructions destination and
shared switch/animation handoff before its presentation. No new Notifications
browser/parity proof is inferred from these state tests or the earlier Account/
Data native run. Remaining Settings sections, full shell and confirmations are
still migration work; source coverage and gates are recorded separately.
