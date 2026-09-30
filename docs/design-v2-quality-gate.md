# Design v2 quality gate

The canonical Design v2 release must keep this gate and the UI parity matrix green. Automated checks are guardrails, not a claim that an automated scanner proves WCAG conformance.

## Automated release evidence

- Playwright exercises 320, 375, 430, 500, 768, 1024, and 1440 CSS-pixel widths, 200% text enlargement, fixed mobile navigation, keyboard focus restoration, Escape, reduced motion, and representative nested/public routes.
- Axe scans login, Library, Insights, Private Sharing, Compare Room, Song League, Notifications, and Automatic Updates without rule exclusions; serious and critical findings fail deployment.
- The parity and quality source checks reject missing inventory groups, a second ambient renderer, hardcoded `/new` feature links, or a Design v2 behavioral source without a colocated unit spec.
- Production builds enforce initial JavaScript, global CSS, and every lazy-route chunk budget. The shell keeps feature pages lazy and service-worker scripts use lazy caching.
- The ambient browser suite verifies one persistent renderer, hidden/reduced-motion behavior, route/scroll/overlay continuity, reflow, and Axe.
- Canonical route smoke coverage and `/new/*` compatibility-redirect coverage run together. The legacy presentation is removed.

## Runtime and performance review

The production baseline is held at initial JavaScript <= 855 KB, global CSS <= 300 KB, and each lazy JavaScript chunk <= 110 KB. Artwork reserves space and non-critical images remain lazy. Long collections use bounded/incremental loading or `content-visibility`; stable domain IDs are used for reorderable lists. The release target remains LCP <= 2.5 s, INP <= 200 ms, and CLS <= 0.1 at p75 for mobile and desktop field data.

The application still opts into ZoneJS because third-party integration paths have not completed a zoneless compatibility migration. Design v2 state code uses signals/pure view models and does not introduce a new ZoneJS dependency. Removing the compatibility opt-in requires measured interaction traces and remains separate from the visual cutover.

## Manual release pass

For each release candidate, record a pass using a desktop screen reader/browser combination. Check skip navigation, landmarks and heading order, navigation, account/settings dialogs, tab sets, validation errors, status announcements, and destructive confirmations. Also inspect text/non-text contrast, 44x44 product hit targets, focus visibility/obscuring, source order, and representative Chrome Performance traces for repeated tasks over 50 ms, tasks over 100 ms, forced reflow, duplicate requests, DOM growth, and artwork CLS.

Record the browser, screen reader, build commit, tester, date, and any exception in the #164 rollout evidence. A missing manual pass blocks release activation.
