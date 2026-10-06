# Snapshot calendar Design v2 handoff

Status: canonical component work complete for the states below; product-screen integration and Angular/calendar browser parity are pending. This is not completion of the Stats slice or the migration plan.

Canonical [Snapshot calendar family](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd/Analytify?node-id=838-27694), page 7:2, Components section 442:19535. Wrapper 835:25848. Shared Day set 144:8011 and shared secondary Button set 24:94 are reused with existing semantic variables and text styles.

The family has 18 variants: Desktop, Mobile and Mobile short × Ready, Loading, Empty, Unavailable, Refreshing and Focus. Desktop panel width356, mobile288 (320px viewport with16px gutters), short panel height328 (360px viewport with16px gutters). All month controls are44×44; day height44, equal fluid seven-column widths42.571 desktop/32.857 mobile. Week rows do not clip outside focus strokes; the short scroll body has4px padding around the3px focus ring. Heading/month/footer remain outside the short body scroll area.

Purpose, Month, Help and Show today shortcut are shared component properties. Message copy is state-owned so changing to Unavailable cannot inherit Empty text. Three comparison native instances prove Purpose changes and Today hides:840:27547 Focus,840:27715 Unavailable,840:27883 Empty short. Close is last in every visible action group. Retry on Unavailable changes to Loading for its matching viewport; completion must reflect the actual service response. The frozen prototype Today is4October2026, not an application clock.

## Intended interaction contract

- Own Stats only. Shared read-only mode must not expose or request private saved snapshots.
- Ranking and comparison triggers open the same chooser with separate purpose and selection. An available date changes only that purpose and dismisses the chooser. Disabled/unavailable dates cannot select. Comparison omits the primary date; Today appears only when eligible.
- Ready uses available-date metadata. Loading is an initial metadata request, Empty is a successful empty result, Unavailable is a metadata failure, Refreshing preserves selectable cached metadata while fetching updates.
- Selecting a saved date closes the chooser. Detail loading/unavailable/retry feedback therefore belongs on the Stats page afterwards, and still needs canonical design and implementation.
- Close/Escape/backdrop dismissal return focus to the opener. Trap Tab inside the open dialog. Arrow keys navigate the date grid, Home/End move within its week, PageUp/PageDown change month; Enter/Space select an eligible focused date. Keep focus stable after refresh and scrolling.
- Use reduced-motion loading indicators without requiring animation to communicate progress.
- Angular must compute runtime days/months, permission and request state. Figma actions are specifications, not executable backend logic.

## Evidence and limitations

Editable components and action/property/geometry ledgers are in this directory. Final visually reviewed composition: stats-calendar-family-post-focus-fix-figma.png. Earlier family screenshot is superseded after fixing90 clipping week rows. Footer had fixed332px width; changed to FILL262px mobile/330px desktop. Border-only sizing attempt did not solve unequal columns; equal borderless column wrappers did. Focus clones dropped text/visibility references; these were restored and native comparison instances verified. First comparison validation failed on hidden instance children; canvas inspection confirmed rollback, and traversal was corrected with skipInvisibleInstanceChildren=false.

Original mechanics frames144:8057 and144:8179 are preserved. New family is not yet wired into canonical product date controls; previous-month navigation still inherits the original mechanics destination. Prototype date actions retain purpose-specific date/label/month updates and Close. A compact audit verifies month variables148:8051/52 are distinct from day-state variables144:8051/52; no month-reset defect was found.

Next: integrate the chooser into canonical product workflows, finish selected-date page loading/empty/failure/retry and compare/search controls, then build reusable Angular calendar presentation and test actual keyboard, metadata and detail workflows across engines/resizing. Do not claim website parity from this component-only evidence.



## Selected-date feedback and October integration checkpoint (7 October 2026)

Shared [Selected snapshot feedback](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd/Analytify?node-id=851-27182) adds12 variants: Ranking/Comparison × Desktop/Mobile × Loading/Empty/Unavailable. Ranking loading uses existing list skeletons; comparison loading uses the shared notice and keeps primary rankings. Error recovery offers Retry then Choose date. Empty uses ordinary text, not error red. Retry changes to matching Loading; Choose date sets purpose and opens a native calendar overlay. Shared list skeleton bars now use FILL with their original width as maxWidth; narrow146px copy columns contain the170px maximum bar. Final visually reviewed image: stats-detail-feedback-final-figma.png. Canonical product page visibility and outcome-driven state wiring are still pending; component appearance is not website parity.

Native October overlay frames850:26615 Ranking/Desktop,850:26784 Comparison/Desktop,850:26976 Ranking/Mobile and850:27145 Comparison/Mobile contain shared calendar instances. All four canonical date fields25:124,25:128,25:812,25:816 now point their October branch to these frames, preserving22 actions including selection variables and the September branches. Comparison examples hide Today for the frozen current-primary context. Dynamic primary-date eligibility, month navigation and backdrop/keyboard integration still need completion. QA reference frames were not promoted to website pages.

Figma rejected component-variant overlay destinations, then nested Frame destinations. Both failed transactions are preserved as error attempts, not passing ledgers. Read-only recovery confirmed rollback. Native destination Frames were moved directly under the existing Prototype mechanics section442:19546, placed below its old content, and that section expanded. Valid component-set recovery actions and canonical field links then succeeded. No destructive cleanup of original calendar mechanics.

The controller's real public workflow also establishes a correction to the initial wording above: ranking selection intentionally chooses a different default comparison, and month navigation skips months without saved dates. Preserve that behavior; comparison selection does not alter ranking selection or range. Calendar clicks now revalidate option ID/date eligibility against current options and shared permission, rejecting stale removed dates, the current primary comparison, and a stale logical Today cell. Characterization/service-boundary evidence is separate from the future responsive calendar presentation.
