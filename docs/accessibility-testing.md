# Accessibility and lint gates

Analytify runs two complementary accessibility layers on every verified change.

`npm run accessibility:check` checks source-level dialog and pointer contracts. `npm run accessibility:browser` starts the application in Playwright's pinned Chromium build and exercises desktop and mobile viewports. The browser suite scans the logged-out page plus authenticated Playlists and Stats fixtures with axe's WCAG 2.0, 2.1, and 2.2 A/AA rules. Serious and critical violations fail the build. It also verifies keyboard focus, a 200% zoomed layout, and reduced-motion behavior.

Authenticated fixtures contain invented local Spotify data and intercept Spotify API requests. They do not use production credentials, a real Spotify developer key, or personal listening data.

There are no axe rule exclusions. The gate filters by impact so moderate/minor observations remain visible in the HTML report while serious/critical findings stop deployment. Any future rule exclusion must name the affected selector, explain the user impact, link a follow-up issue, and include an expiry condition.

`npm run lint` checks application TypeScript, Angular templates, and the browser suite. Constructor injection and default change-detection migrations are deliberately not enforced: both are repository-wide architectural changes with runtime implications, not safe formatting fixes. Intentional empty recovery catches and the stored-URL control-character expression are also documented in the lint configuration. Correctness and Angular template-accessibility rules remain enforced.

CI uploads `playwright-report` and `test-results` with the existing test evidence when a failure needs inspection.
