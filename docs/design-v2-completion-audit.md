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
