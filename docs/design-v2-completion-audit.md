# Design v2 completion audit

Checked on 2026-10-01. The initiative remains incomplete until the outstanding release evidence below is recorded.

## Implemented and verified

Issues #152–#162 and #166–#170 are closed. #163 was reopened after the completion audit because its explicit manual screen-reader and performance release requirements remain unproven; #164 and #165 are also open. Canonical route implementation is in `f20dd13`; security dependency fixes are in `6c0fedb`, isolated integration ports in `867df6a`, and the login landmark correction in `e94e8a3`.

The canonical rollout passed the full local verification gate with 622 unit tests, coverage thresholds, policy/security contracts, type checks, and production bundle budgets. The browser suite passed all 64 desktop/mobile tests. CI for `6c0fedb` independently passed those build/browser checks, security advisories, and CodeQL, then failed before deployment because port 54322 was occupied. The integration configuration now uses 55320–55322.

Canonical routes reuse domain controllers and services. `/new/*` redirects preserve query parameters and fragments; regression coverage exists in routing unit tests and the browser suite. Legacy global shell/header/footer code and runtime design branching have been removed. Shared feature modules retain the dependencies needed to compile their domain-controller presentation classes.

## Outstanding evidence for #164 and #165

- Successful verification, schema rehearsal, and production activation for the latest commit.
- Real desktop screen-reader/browser review, with tester, version, date, commit, and findings.
- Representative Lighthouse/performance trace evidence, including interaction and layout stability; bundle budgets alone do not establish Core Web Vitals.
- Staging rollback rehearsal using the documented immutable release activation procedure. Automated rollback tests exist but do not establish a staging rehearsal.
- Final production canonical-route smoke and tracking-issue checklist reconciliation after the above evidence is collected.

Do not close the rollout or tracking issue based solely on the implementation or automated test counts.

## Local Lighthouse baseline (2026-10-01)

Lighthouse 13.5.0 ran against the production build at commit `68e325e`, served locally with `http-server`, using Brave Origin headless (Chromium 154). The entry URL `/` resolved to `/login`. These are single-run, simulated lab results, not field p75 measurements or authenticated-route coverage.

| Profile | Performance | Accessibility | LCP | CLS | Total blocking time |
| --- | --- | --- | --- | --- | --- |
| Mobile | 71 | 100 | 8.09 s | 0 | 185 ms |
| Desktop | 95 | 100 | 1.53 s | <0.000001 | 11 ms |

The mobile result does not meet the LCP target. The local server transferred uncompressed assets, so this is not evidence of production's transfer performance. It nevertheless exposed unnecessary authenticated-route preloading while signed out; this is now prevented, with a regression unit test. A second mobile run after that change scored 65 performance / 100 accessibility, with LCP 7.12 s, CLS 0, and TBT 187 ms; no performance pass is claimed from those results. Total blocking time is not INP. Accessibility score 100 does not replace the required real screen-reader review. The user confirmed they use Brave Origin and have not performed that review yet.

Authenticated Library tracing also exposed an intermittent mobile CLS failure (0.174). Shift-source capture identified the toolbar appearing after playlist data arrived. The toolbar now renders from the start, with unit coverage of the loading state. Six repeated browser performance checks (three desktop, three mobile) passed after this correction. The performance attachment retains shift sources for future failures; this limited mocked-data check does not establish all-route or field performance.

## Production evidence (2026-10-01)

Workflow run `36916685208` successfully verified and deployed `68e325e`; the live `/version.json` independently reported the same commit. Production mobile Lighthouse scored 70 performance / 100 accessibility with simulated throttling (LCP 8.91 s, CLS 0, TBT 174 ms). Actual DevTools throttling corroborated the failure: 61 / 100, LCP 8.75 s, CLS 0, TBT 173 ms. Neither run establishes field p75.

Network evidence showed the largest JavaScript response transferring 577 KB for a 576 KB resource. A live request advertising gzip and Brotli returned no Content-Encoding. The versioned Nginx snippet now enables gzip and Vary negotiation for CSS, JavaScript, and Wasm (not API JSON). Configuration regression tests pass; deployment's existing `nginx -t` remains mandatory. Live Content-Encoding verification and a fresh production Lighthouse measurement are still required after this configuration is deployed.

Release `758ee0f` passed run `36918372470` completely, including 66 browser tests and production activation. Live JavaScript now returns `Content-Encoding: gzip` and `Vary: Accept-Encoding`. Production mobile Lighthouse improved to 83 performance / 100 accessibility, LCP 4.04 s, CLS 0, TBT 211 ms. The largest script transferred 166 KB instead of 577 KB. LCP still fails the target.

Initial-loading follow-up enables Angular's native `index.preloadInitial` generation (five local initial-module hints, no eager feature-page hints) and mounts the always-needed shell directly instead of waiting for its route-container chunk. Routing tests still verify feature-page lazy boundaries. The compressed local preview measured LCP 3.54 s / TBT 199 ms with hints alone, then LCP 3.25 s / TBT 127 ms with direct shell mounting (scores 85 and 88 respectively; CLS 0 in both). These single local samples are not production or field evidence. The production index retains directly active CSS, generated asset validation passes, and service-worker index integrity matches the generated HTML. A service-worker-controlled reload had no browser errors. All 12 targeted desktop/mobile quality and performance tests passed; full verification and post-deployment remeasurement are required.

The production report also identified HTTP/1.1 asset delivery. A guarded installer follow-up reads `nginx -V`, requires the HTTP/2 module, and selects the modern server directive or older TLS-listener syntax. It changes only the exact Analytify TLS virtual host, preserves explicit settings, and retains configuration validation and restoration on failure. All 37 deployment tests pass. This is not yet proof of negotiated HTTP/2 or improved production performance; both must be checked after deployment. Syntax reference: [official Nginx HTTP/2 module documentation](https://nginx.org/en/docs/http/ngx_http_v2_module.html).

The Library performance test now also records actual Chrome timeline/user-timing traces and attaches `chrome-performance-trace.json` alongside the metric summary. Search and account-dialog intervals are named and their presence is asserted. Desktop/mobile capture passed; inspection found 40,766 / 39,375 trace events with both named intervals. Maximum whole-trace RunTask durations were 102.6 / 101.1 ms; those results still require interval-level analysis, not a blanket interaction-performance pass. This is mocked-data Library evidence only, not all-route, Angular DevTools, screen-reader, or field p75 proof.

HTTP/2 release `3109f37` passed run `36921584198` completely. Live version identity matched, and a fresh production report confirmed `h2` for site requests. Mobile Lighthouse scored 88 performance / 100 accessibility with LCP 3.30 s, CLS 0, and TBT 171 ms. LCP remains above target. Interval-level inspection of the local Library traces found maximum overlapping RunTask durations of 35.9 / 14.9 ms during search and 39.9 / 26.4 ms during account-dialog interaction (desktop/mobile viewport respectively). These are unthrottled local samples, not actual mobile hardware or INP measurements.

## Initial forms dependency follow-up (2026-10-02)

Final rerun outcome: `npm run verify` passed with 627 unit tests, coverage thresholds, production build, and asset budgets; the complete desktop/mobile browser suite passed all 66 tests. Earlier in-progress and regression observations below describe the validation sequence, not outstanding test failures. Production deployment and remeasurement remain required.

Bundle attribution showed the shell loading Angular forms through `SharedModule`. The accessible-dialog directive is now standalone (still re-exported by `SharedModule` for existing pages); the shell imports it and CommonModule directly. Login uses a native checked/change binding without FormsModule. Initial JavaScript fell from 792,546 to 746,254 bytes. Consent behavior has regression coverage in both directions. Full browser testing caught missing async change-detection notification for restored consent; explicit notification fixes that and also preserves asynchronous login-error announcements. Saved cookie consent and previous IndexedDB migration checks passed on desktop/mobile after the fix. The compressed local Lighthouse sample scored 89 / 100 with LCP 3.24 s, CLS 0, TBT 119 ms; no production performance pass is claimed. Full verification and complete browser reruns are in progress.

Workflow `36951138022` subsequently passed verification, schema/function deployment, production activation, and live component identity checks. An independent request to production `/version.json` confirmed `c750715020b0b8cfa6e16f6448f7de466c1b9452`. Supply-chain workflow `36951138047` also passed. A new production performance measurement remains required.

## Album-detail parity regression (2026-10-02)

The deeper quality audit found that the v2 album detail omitted its songs and used a mouse-only card click. It now exposes a native View songs button, ordered playlist songs, Spotify artwork actions, and focus restoration on returning to the album list. A seeded IndexedDB browser case also exposed the Songs controller not notifying its OnPush presentation after asynchronous cache loading. The presentation now supplies a change detector; route load, refresh, loader progress, and incremental scroll updates notify it explicitly. The existing domain loading/cache rules remain unchanged.

Thirteen targeted controller/presentation unit tests passed. Complete `npm run verify` subsequently passed with 632 unit tests, coverage thresholds, production build, and bundle budgets; all 68 desktop/mobile browser tests passed, including album keyboard activation, focus restoration, and Axe checks. Targeted lint and whitespace checks passed. The first wider Library run was interrupted by development hot reload during browser seeding; the settled-build full rerun passed. This does not resolve the pending manual screen-reader, staging rollback, or field performance gates.

## Populated Library child-route verification (2026-10-02)

Analysis and Artist Details had the same asynchronous notification gap as Songs. Their v2 presentations now supply change detectors to the shared controllers. Analysis notifies after route loading and loader progress; Artist Details notifies when cached/remote data or an API error finishes loading. Cache precedence, freshness, and generation guards are preserved.

New browser cases seed actual-shaped playlist and artist payloads in IndexedDB and assert visible analysis metrics and artist identity, rather than accepting a loading heading as evidence of a working child route. Both desktop and mobile cases pass Axe checks. Unit tests cover asynchronous completion notification, playlist search/saved-filter delegation (including unchanged-state branches), and all six Analysis metric mappings. `npm run verify` passed with 638 unit tests, coverage thresholds, and production build/asset budgets; the full 70-test browser suite passed. Full lint and whitespace checks passed. Lint was run separately with the bundled runtime after the combined command's second invocation selected the unavailable system Node executable.

A fresh production mobile Lighthouse sample at `2026-10-02T01:49:39Z`, while live version identity still reported `c750715`, scored 89 performance / 100 accessibility, LCP 3.20 s, CLS 0, TBT 165 ms, with no run warnings. It corroborates the local forms-free improvement but still fails the 2.5 s LCP target; it is neither field p75 nor all-route proof.

## Coverage enforcement follow-up (2026-10-02)

The spec-presence checker omitted Insights v2 wrappers and several design-navigation helpers. Source discovery now covers all 19 behavioral v2 sources. `test:ci` additionally rejects missing per-file coverage and increases in absolute uncovered statements/branches/functions/lines against the measured `d9da0bf` baseline; new files default to zero uncovered code. Six policy tests prove detection and failure behavior. Existing gaps are explicitly preserved as debt, not relabeled as complete branch coverage or justified exclusions. Full verification passed with 638 unit tests and the new guard enabled; lint and build/asset budgets passed. This tooling-only change does not add new browser runtime behavior.

Run `36952367224` for `4426100` passed its verification phase but production activation was deliberately rejected because `d9da0bf` superseded it before database mutation. This was the deployment freshness guard, not a build regression. The newer release run is still being checked; no activation success is claimed here.

## Library branch-coverage ratchet (2026-10-02)

Added behavioral tests for preserving album detail when staying in Albums, closing it on both other views, delegating both sort directions before filtering, returning to the originating playlist, and album focus restoration without an album ID (name fallback). All four Library v2 wrappers now report 100% statements, branches, functions, and lines in the full 645-test run. Their previous uncovered-code allowances were removed; the new guard passed for all 19 sources. These wrapper results do not establish complete coverage of inherited domain controllers or other v2 components. Production runtime code is unchanged by this ratchet.

Release `d9da0bf` subsequently passed run `36952848027` completely, including 70 CI browser checks, schema rehearsal, production activation, and live component identity checks. An independent production `/version.json` request confirmed `d9da0bf4bfdccba76e2157720da55e2fe3326514` (deployed at `2026-10-02T01:58:33Z`). The coverage/testing-only follow-up is published after that successful activation, not while it is pending.

## Overlay lifecycle and cancellation (2026-10-02)

The shared overlay service previously allowed a dismissed pending import to open later, could mount an old request into a replacement host, and retained active state if the host destroyed the component directly. Generation-bound loading now invalidates cancelled/replaced requests, rejects concurrent pending opens, releases the lock after import failure, cleans up close subscriptions, and tracks external destruction. Stale close references cannot destroy a newer overlay.

Public lifecycle regression tests cover missing hosts, duplicate pending requests, dismissal, replacement/unregistration, failed imports, optional close outputs, repeated registration, stale events/references, external destruction, and an old load finishing while a newer request remains pending. The service now measures 100% statements, branches, functions, and lines; its previous allowances were removed. Full verification passed with 652 tests before the final additional pending-request race test; the final full unit rerun passed all 653 tests and the stricter coverage guard. All 24 targeted desktop/mobile Library/quality browser cases and full lint passed, including settings-sheet keyboard/focus behavior. Full production build and asset budgets passed; no screen-reader or field-performance pass is inferred.

## Navigation and ambient-state branch ratchet (2026-10-02)

Added tests proving default navigation preserves a cancelled result and propagates routing failure, plus blank/case-normalized ambient route fallback and restoring default state after a previous route. The navigation service and ambient state now measure 100% statements, branches, functions, and lines. Their previous branch allowances were removed; the math allowance was reduced from two to one uncovered branch. That remaining math branch is the defensive `codePointAt(0) ?? 0` fallback inside a non-empty `for...of` character iteration; no artificial invalid character fixture or full-math-branch claim is made. The full unit suite passed 657 tests with all coverage guards. These changes add tests only and do not change navigation or animation runtime behavior.

## Account and destructive-action failure states (2026-10-02)

Cancelling Cloud Backup enable could leave its native switch checked despite no confirmed enable; the change handler now restores the authoritative state immediately. Failed disable was previously stored as an error but not rendered in the account hub. It now appears as an alert, with busy state and disabled conflicting mutation controls. Duplicate enable/destructive requests are ignored while an action is pending, and Back/Cancel cannot leave an in-flight confirmation.

Destructive confirmation now stays open if post-action navigation fails or is cancelled. Feedback explicitly warns that some steps may already have completed rather than implying that no data changed. Regression tests cover these cases and ensure a failed cloud deletion does not proceed to logout. Full verification passed with 663 unit tests, coverage/build/bundle checks, and full lint. The new desktop/mobile browser cancellation cases prove the switch stays off and regains focus. The first wider browser run encountered trace-artifact deletion from overlapping runners (ENOENT, not a product assertion); the non-overlapping full rerun passed all 72 cases. Shell uncovered-code limits were ratcheted down to the newly measured counts (23 statements, 15 branches, 13 functions, 14 lines); the stricter guard passes without claiming the remaining gaps are complete.

The preceding coverage release `3f4b7ad` passed run `36953584391` completely; independent live version verification matched `3f4b7ad65cf21f97dd83d31a5c3daafa7eda6652`, deployed at `2026-10-02T02:10:23Z`.

## Logout failure feedback (2026-10-02)

Regular logout previously closed the account dialog and discarded a promise that could reject during auth cleanup or navigation. It now catches failures, reopens the account hub with conservative refresh guidance, releases busy state, and rejects duplicate requests while pending. A cancelled router result is treated as incomplete rather than success. Anonymous-account deletion still requires its separate explicit confirmation.

Six regression cases cover anonymous consent, successful recoverable-account logout, duplicate requests, auth failure, navigation rejection, and navigation cancellation; error cases assert a rendered account alert rather than only internal state. Full verification passed 669 unit tests, coverage and build/bundle gates; full lint and all 26 targeted desktop/mobile Library/quality browser checks passed. Shell allowances were reduced to 17 statements, 13 branches, 11 functions, and 9 lines of remaining uncovered code. This is not a complete shell-coverage or overall release-gate claim.

## Remaining account-action branch tests (2026-10-02)

Added tests for unavailable cloud identity (no deletion/logout), successful deletion of exactly the current identity in delete/logout/navigation order, anonymous logout after explicit confirmation, Error/non-Error backup enable failures retaining consent, and the rendered profile icon after artwork failure. The full unit/coverage gate passed 675 tests and lint passed. Shell uncovered-code allowances were reduced again to 10 statements, 10 branches, 8 functions, and 3 lines. These test-only changes add no browser runtime behavior and do not replace the remaining manual accessibility/performance evidence.

## Library controller and legacy presentation separation (2026-10-02)

Songs, playlist analysis, and artist details now import presentation-free controller files rather than files containing both controllers and old component declarations. Their unused legacy UI module imports were removed. Existing legacy adapters re-export the controller names for compatibility with established tests; domain behavior is unchanged except for correcting a controller-local type reference to use the controller itself. The quality gate prevents these three redesigned pages from regaining legacy screen module dependencies or presentation metadata in their controllers.

Full `npm run verify`, lint, and all 26 desktop/mobile Library and quality browser checks passed, including production compilation, index/bundle gates, 675 unit tests, and the per-file coverage gate. Loading/performance source checks now inspect the extracted controllers. The initial JavaScript total remains within budget at 748001 bytes; this change is not claimed as an initial-load performance improvement. The preceding deployment run `36954757044` completed successfully. Real screen-reader review remains pending: the user confirmed Brave Origin but has not performed that review.

## Full ranking interaction and DOM sample (2026-10-02)

Extended the browser performance suite with 100 distinct mocked songs delivered through the real paginated Top Songs request path. Desktop and mobile each exercise three cycles of search narrowing/restoration, Artists/Songs tab changes, keyboard-opened position-history dialogs, Escape, and restored row focus. All cycles restore exactly 100 song rows and the original total element count; closed history dialogs are absent from the DOM and artwork has reserved dimensions. This verifies bounded rendering for the current Top 100 feature, not arbitrary-sized collections.

All four performance-suite cases passed, including the existing Library timeline captures. The HTML report carries dense-ranking DOM samples labeled as local mocked-data evidence. Browser-automation round-trip durations are explicitly not field INP or representative-device timings. This does not complete the broader performance or manual accessibility requirements in #163.

## Independent native ranking actions (2026-10-02)

The APG/native-control audit found button-role song rows and artist cards containing separate Spotify buttons. Those interactive ancestors are now passive layout containers. Each history action is its own labeled native button, separate from artwork's Spotify action; no custom Enter/Space handling is needed for the new buttons. History actions preserve text layout, reserved artwork sizes, 44px minimum height, and the existing text-selection behavior.

A rendered component regression checks semantics, action delegation, and absence of nested interactive controls. Browser checks exercise Space/Enter, Escape, and restored focus for both song and artist history actions, alongside the full-ranking repeated interaction sample. Ten Insights/performance cases passed; the updated six-case Insights suite also passed independently. Full verification passed 676 unit tests, coverage, production compilation, and bundle/index gates. This fixes an identified interaction flaw but is not a substitute for the pending manual screen-reader review.

## Populated settings reflow and target audit (2026-10-02)

Settings close buttons were 36px and schedule fields were 40px, below the 44px product standard. They now meet 44px. The new browser case loads six schedule rows through a mocked RPC, expands a personal editor, and tests both 320px reflow and 768px with 200% text. It measures the close/input/select targets, verifies the close action remains within the viewport and unobscured after body scrolling, checks dialog overflow/Axe, and verifies native keyboard close/focus restoration.

The strict accessible-name lookup also exposed decorative icon glyphs in account and schedule summary names. Decorative shell and schedule-sheet icons now use `aria-hidden`; rendered unit regressions guard that distinction. All 12 quality browser cases, lint, and full verification passed with 676 unit tests and the production bundle/index gates. Remaining manual and broader performance requirements are unchanged.

Independent production version inspection confirmed `bfce01f9e88cb6b98b6c1cd8dbf82386895bed4b`, deployed at `2026-10-02T02:39:26Z`; its verify/deploy run `36955858496` completed successfully.

## All-severity WCAG scan gate and notification names (2026-10-02)

Both browser Axe helpers now fail on every violation under the selected WCAG A/AA tags rather than ignoring moderate/minor findings. No rule exclusions were added. The full browser run passed all 76 cases with the shared feature helper tightened; a subsequent 16-case accessibility/login run separately verified the tightened local helper. This remains automated, sampled-state evidence, not full WCAG conformance or a replacement for manual screen-reader testing.

The notification sheet's remaining decorative icons are hidden from assistive technology. The nine-case rendered notification unit suite passed, including icon semantics across all six device outcome states, and browser settings checks verify no exposed decorative icon remains in the notification dialog. Lint and the production build/index/bundle gates passed. The latest pushed deployment `36956995635` is still in progress; these follow-up changes are queued locally rather than superseding its release.

## Native transition fallback and route-focus repair (2026-10-02)

Added desktop/mobile browser cases that instrument the actual native View Transition API and separately disable it before app initialization. Keyboard navigation from More to Compare Room must render the expected content, retain the exact ambient node, avoid page errors, and focus the new main landmark. Supported samples must invoke the native API; disabled samples must make no such calls. The disabled sample is a Chromium capability simulation, not evidence from every unsupported browser engine.

These tests exposed a real focus handoff failure. The shell's first-navigation flag could miss its initial event, and timer-based focus did not guarantee dialog teardown/render completion. The shell now uses Angular's post-render callback directly on completed navigation, removing the unreliable flag. A rendered unit regression verifies the tools dialog is gone and the main region is not inert/hidden when focus is handed over. The direct ambient Axe scan now also rejects every selected-tag violation rather than filtering severity.

The final 26-case login/ambient browser run passed. Full verification, including 677 unit tests, per-file coverage, production index/bundle gates, and lint passed without raising coverage allowances. The prior `51eeb1acaff173e5d9360fc508e9feaac40dd0fe` release is independently confirmed live at `2026-10-02T02:53:28Z`, and run `36956995635` succeeded. Manual screen-reader and broader performance/staging rollback evidence remain pending.
