# Plan for a thoroughly tested Design v2 application

Prepared 6 October 2026 from the repository's current configuration. This is a work specification, not a claim that the work or verification has been completed.

## Intended result

One responsive Angular implementation of the canonical Figma design, preserving the intended product workflows and protected by meaningful unit, integration, browser, accessibility and visual regression tests. Target at least **98% lines, statements, functions and branches in each application-code suite**, with explicit reporting of remaining uncovered behavior.

Coverage measures executed code, not correctness. No finite test suite proves that nothing can ever break. Completion means the gates below pass and the tested behavior, remaining gaps and limitations are documented honestly.

## Boundaries and references

- Work on `codex/design-v2`. Preserve unrelated local changes.
- Follow [development-and-releases.md](development-and-releases.md) and [figma-first-workflow.md](figma-first-workflow.md).
- Canonical [Figma file](https://www.figma.com/design/5v8ckmlbfhMDWwP5sTdSXd), page `7:2`. Canonical screens and components define the design; QA and archived copies are not separate pages to implement.
- Follow [figma-feature-gap-audit.md](figma-feature-gap-audit.md). Blocked-user management and admin runtime health are intentional exclusions and must not be restored simply because old code exists.
- The loading components and recent login/tab-layout corrections are in Figma. Re-read their current nodes before implementation.
- Do not merge into `main`, deploy to the shared production backend, change stable releases or register a `/new` service worker that captures stable URLs. Deployment and production-affecting changes require explicit approval.

## Current tooling

| Area | Existing tooling/configuration | Work needed |
| --- | --- | --- |
| Angular unit/component tests | Angular unit-test builder, Vitest, V8 coverage, jsdom | Expand behavioral cases and coverage inclusion; verify native/browser behavior separately |
| Browser workflows | Playwright; Desktop Chrome and Pixel 7 projects | Add Firefox/WebKit and a responsive viewport matrix |
| Accessibility | axe Playwright integration and existing static checks | Combine automated checks with keyboard/focus tests |
| Worker logic | Node test runner under `services/sync-service` | Measure its own coverage and fill gaps |
| Edge functions | Deno checks/tests under `supabase/functions` | Measure their own coverage and add integration boundaries |
| Quality gates | `verify:ci`, `test:ci`, feature/security/policy scripts | Preserve existing checks and make browser/visual tests required |

`scripts/check-coverage-thresholds.mjs` currently enforces statements 55%, branches 40%, functions 51%, lines 59%. These are minimum thresholds, not current measured coverage. The Design v2 coverage script also enforces uncovered-code budgets for selected behavioral files. Neither is equivalent to an application-wide 98% target.

## 1. Establish a reproducible baseline before migration

1. Read AGENTS.md, repository instructions, release docs, test configuration and relevant workflows. Record branch, commit, tool versions and available runtimes.
2. Run the existing unit, type, policy and browser checks. Record failures separately from new failures. Do not silently change expected results to make a failing baseline green.
3. Generate fresh coverage reports for frontend, worker and edge-function code. Inventory production sources and prove untested files are included in denominators with zero coverage where appropriate.
4. Create a route/feature/state inventory and link each workflow to its code, canonical Figma node, permissions and tests. Audit claims in older parity documents against actual behavior.
5. Store baseline evidence and a tracked checklist in `docs/design-v2-testing-progress.md`: commands, commit, totals, failures, gaps, next slice and limitations. Update it after meaningful milestones.

## 2. Protect existing behavior, then migrate feature by feature

Do not wait until the entire redesigned website is implemented to start testing. First add characterization tests for behavior that must survive. For each feature, complete this cycle:

1. Trace the current workflow and data effects; identify correct behavior and known defects. A characterization test must not bless a known bug.
2. Complete missing Figma states/components before dependent UI implementation. Specify triggers, loading/empty/error/success states, permissions, navigation and recovery.
3. Add regression tests around the existing logic and service boundaries.
4. Implement the shared responsive presentation and adapt state/navigation to the designed workflow. Keep pure business logic separate from rendering when this makes it easier to verify.
5. Add component, integration and browser tests for the resulting workflow; compare browser screenshots with Figma.
6. Re-run affected regression tests and required checks. Finish the slice before starting unrelated redesign work.

Preserve correctness while changing implementation; update tests for intentionally changed product behavior, not merely because the new implementation fails old assertions.

## 3. Required behavioral coverage

Tests should assert user-visible outcomes and data effects. Include applicable success, empty, failure, permission and recovery cases for:

- Login, initial Spotify app setup, saved-app reconnect, replacement app, callback failure and wrong-account recovery; terms acceptance and logout.
- Own/shared playlists: filters, sorting, search, pagination/loading, artists, albums, selected-album songs and analysis calculations. Spotify destinations for songs/artists/albums and source/saved playlists must be correct and safely validated.
- Stats: time ranges, saved snapshots, comparisons, historical search, shared read-only mode, rank movement, orange hot movers and blue Top 10 debuts. Test thresholds, ties, missing history and the ten-entry pool per category.
- Rank graphs: category-specific axes, coordinate mapping, sparse/dense data, point inspection and insufficient history.
- Friends and private sharing: invitations, request/claim/grant/revoke flows, owner/recipient restrictions, shared snapshot revisions, updating the same Spotify copy, partial failure and retry without duplicates.
- Comparison: multiple playlists, Liked Songs, public URLs, own additional selection, invited participants/QR joins, intersection/union, contribution counts, approval changes, cancellation, expiry and partial playlist creation recovery.
- Song League: submission windows/timezones, eligibility, scoring, four-week recommendations, permanent standings, profile/breakdown navigation, member limits, invitations/rejoin requests, roles, ownership changes, archive/leave/delete/history actions and confirmations. Check implemented lifecycle support against the designed contract before claiming parity.
- Settings: Cloud Backup capabilities, automatic-update intervals/minima, required tasks, notifications/permission states, account/privacy and applicable data clearing.
- Admin features retained in scope: schedules, policies, recent runs and moderation/appeals. Exclude runtime health.
- Worker/edge logic: retries, timeouts, cancellation, duplicate prevention, permissions, token refresh, scheduling/timezones and retention boundaries. Use test credentials/data only.

Include boundary values, malformed/missing inputs, concurrency and stale async responses. Test navigation during an in-flight request and prevent results from a previous user/route overwriting the current state. Use property-based or mutation testing selectively for scoring, eligibility, date calculations and merge/retry logic if it adds demonstrable value.

## 4. Responsive and interactive GUI verification

Use Playwright geometry assertions plus screenshot comparisons; neither substitutes for the other.

- Exercise Chromium, Firefox and WebKit. Use widths around 320, 360, 390, 768, 1024, 1440 and 1920, with representative short and tall heights. Test breakpoint boundaries and resizing an already-open page/dialog.
- Assert no unintended horizontal overflow, overlapping controls, clipped text or inaccessible actions. Use long names/descriptions, many rows, empty data and delayed responses.
- Check login centering, short-window scrolling, footer placement and transparency, responsive sidebar, and equal shared geometry across playlist tabs.
- Check equal card heights within each row, content-driven height, consistent width, and Open buttons pinned to the bottom without truncation.
- Check Spotify hover/focus green borders, links, active tab/sidebar indicators, menus, dismissal, dialog blur, focus trap/return and Cancel-last ordering.
- Check page/loading skeletons, background refresh preserving cached content, busy buttons blocking duplicate actions, errors/retries and successful recovery.
- Check QR visibility, selection color, keyboard selection, notification states and permission restrictions.
- Check particles and route glows independently; verify reduced motion. Freeze decorative animation only in visual snapshots, and test animation behavior separately.
- Use deterministic fixtures, clocks, dates/timezones, fonts and random seeds. Wait for an explicit ready state; avoid arbitrary sleeps. Review golden-image changes against the design rather than auto-accepting them.
- Run axe on representative routes and important states, plus explicit keyboard, focus, contrast and accessible-name checks. Automated accessibility checks alone are insufficient.

Use mocked network responses for exhaustive deterministic scenarios, and a separate isolated integration environment for selected real service contracts. Test fixtures must not modify production data or send real notifications.

## 5. Coverage and CI policy

1. Define denominators for frontend, worker and edge application code separately. Include shared helpers, adapters, controllers and services, not only new components or files already imported by tests.
2. Exclude only generated code, dependencies, build artifacts, declaration-only files and justified non-executable sources. Document exclusions. Do not hide difficult logic with ignore annotations or broad patterns.
3. Raise thresholds through explicit interim milestones while expanding tests. Final completion requires 98% for every metric in every scoped suite; a large suite must not mask another suite's low coverage.
4. Enforce coverage for new/changed behavioral files and inspect remaining per-file gaps. Supplement numeric gates with critical-workflow tests; 98% global coverage alone is insufficient.
5. Keep unit coverage separate from browser/integration evidence. Do not add percentages together or count screenshots as branch coverage. Instrument other code types with appropriate tooling if included in the target.
6. Update CI to require the existing policy/build/type/lint checks, unit and integration suites, browser workflows, accessibility and approved visual comparisons. Verify that browser tests are actually scheduled; `verify:ci` currently does not itself invoke `accessibility:browser`.
7. Treat flakes as failures to investigate. A retry passing must not conceal an unstable test. Capture traces, screenshots and logs; avoid leaking tokens or personal data into artifacts.

## 6. Completion evidence

Declare the work complete only when:

- Every retained feature/state in the inventory has implementation and test evidence, with no unresolved critical parity gaps.
- Canonical Figma and the running responsive application agree on appearance and workflow.
- Fresh frontend, worker and edge reports satisfy the defined 98% gates; exclusions and remaining uncovered behavior are documented.
- Required checks, builds, real-contract integration tests and browser projects pass on the final commit.
- GUI geometry and approved visual regressions pass with deterministic data across the agreed matrix.
- No tests are skipped or quarantined without a documented reason and an explicit unresolved limitation.
- The report lists commands, actual results, covered environments, residual risks and required deployment approvals. Missing infrastructure is reported as unverified work, not a pass.

Implement changes and tests on the development branch; deliver reviewable diffs and evidence. Do not deploy or merge as part of this plan.
