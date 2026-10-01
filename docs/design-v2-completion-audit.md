# Design v2 completion audit

Checked on 2026-10-01. The initiative remains incomplete until the outstanding release evidence below is recorded.

## Implemented and verified

Issues #152–#163 and #166–#170 are closed. Canonical route implementation is in `f20dd13`; security dependency fixes are in `6c0fedb`, isolated integration ports in `867df6a`, and the login landmark correction in `e94e8a3`.

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
