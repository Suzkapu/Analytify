# Design v2 quality gate

The Design v2 development release at `/new/` must keep this gate and the UI parity
matrix green. The user's 2026-10-04 decision keeps main's original interface
independent; the earlier canonical-cutover plan is superseded. Automated checks
are guardrails, not a claim that a scanner proves WCAG conformance.

## Automated release evidence

- Playwright exercises 320, 375, 430, 500, 768, 1024, and 1440 CSS-pixel widths, 200% text enlargement, fixed mobile navigation, keyboard focus restoration, Escape, reduced motion, and representative nested/public routes.
- Axe scans login, Library, Insights, Private Sharing, Compare Room, Song League, Notifications, and Automatic Updates without rule exclusions; every finding under the selected WCAG A/AA tags fails deployment, including lower-severity findings. This is scoped automated evidence, not complete conformance proof.
- The parity and quality source checks reject missing inventory groups, a second ambient renderer, hardcoded `/new` feature links, or a Design v2 behavioral source without a colocated unit spec.
- Production builds enforce initial JavaScript, global CSS, and every lazy-route chunk budget. The shell keeps feature pages lazy and service-worker scripts use lazy caching.
- The ambient browser suite verifies one persistent renderer, hidden/reduced-motion behavior, route/scroll/overlay continuity, reflow, and Axe.
- Browser coverage runs at `/new/`; normal routes are independently tested by
  main's workflow. Preview assets and service-worker scope remain inside `/new/`.
  The stable release contains no preview presentation.

## Unit coverage enforcement

The shared source policy includes Library and Insights v2 wrappers, the shell, primitives, ambient renderer, and design navigation. It discovers future matching sources automatically; a missing colocated spec or missing coverage entry fails CI. Barrel exports and the declarative lazy-route configuration are excluded; route behavior remains covered by the routing suite. New modules under v2 feature directories are not blanket-excluded.

`test:ci` checks per-file absolute uncovered statements, branches, functions, and lines against `scripts/design-v2-coverage-baseline.json`, measured from the full 638-test run on `d9da0bf`. Missing baseline entries/metrics allow zero uncovered code. Adding covered code cannot dilute a regression as it could with percentage-only thresholds. Six policy regression tests cover source discovery, absent evidence, new-file defaults, dilution, report path normalization, and malformed counters.

The baseline preserves existing coverage gaps; it is not a declaration that they are justified exclusions or that quality issue #163 is complete. Review new behavior and branches alongside the diff, add meaningful tests, and ratchet existing allowances down as gaps are covered. Do not raise allowances to make a failing change pass. This per-file guard does not establish changed-line coverage or replace the required behavioral review.

## Runtime and performance review

The production baseline is held at initial JavaScript <= 855 KB, global CSS <= 300 KB, and each lazy JavaScript chunk <= 110 KB. Artwork reserves space and non-critical images remain lazy. Long collections use bounded/incremental loading or `content-visibility`; stable domain IDs are used for reorderable lists. The release target remains LCP <= 2.5 s, INP <= 200 ms, and CLS <= 0.1 at p75 for mobile and desktop field data.

The application still opts into ZoneJS because third-party integration paths have not completed a zoneless compatibility migration. Design v2 state code uses signals/pure view models and does not introduce a new ZoneJS dependency. Removing the compatibility opt-in requires measured interaction traces and remains separate from the visual cutover.

## Manual release pass

For each release candidate, record a pass using a desktop screen reader/browser combination. Check skip navigation, landmarks and heading order, navigation, account/settings dialogs, tab sets, validation errors, status announcements, and destructive confirmations. Also inspect text/non-text contrast, 44x44 product hit targets, focus visibility/obscuring, source order, and representative Chrome Performance traces for repeated tasks over 50 ms, tasks over 100 ms, forced reflow, duplicate requests, DOM growth, and artwork CLS.

Record the browser, screen reader, build commit, tester, date, and any exception
in the #164 evidence. The user deferred this review and permits the development
preview; a missing manual pass still prevents claiming the quality issue complete.
