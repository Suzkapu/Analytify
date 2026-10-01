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
