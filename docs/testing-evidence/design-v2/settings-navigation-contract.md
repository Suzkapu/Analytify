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
