# Reusable implementation prompt

Work in `/mnt/Storage/ProgrammingProjects/Analytify` on `codex/design-v2` to complete the Figma Design v2 migration and the comprehensive regression testing described in `docs/tested-design-v2-implementation-plan.md`. Read that plan, AGENTS.md, `docs/figma-first-workflow.md`, release boundaries and the current feature-gap audit before making changes.

Start with a fresh code/test/coverage inventory and baseline. Protect existing intended behavior with meaningful characterization and service-boundary tests before changing its UI. Then complete one feature at a time: verify its real workflow, finish missing canonical Figma states, implement reusable responsive Angular components and adapt the logic, add unit/component/integration/browser tests, compare the running UI to Figma and run relevant regression checks.

Use the existing Vitest/V8, Playwright, axe, Node and Deno tooling where applicable. Achieve at least 98% lines, statements, functions and branches separately for frontend, worker and edge application-code suites. Include untested production sources; document justified exclusions. Do not inflate coverage with implementation-mirroring tests, broad exclusions, ignore annotations, weakened assertions, disabled tests or blindly updated screenshots. High coverage is not proof of zero bugs: also test critical workflows, permissions, boundary conditions, async races, partial failure and recovery.

Add deterministic responsive geometry and visual tests across Chromium, Firefox and WebKit, desktop/mobile widths and short/tall windows. Test resizing, card sizing, footer placement, login centering, stable playlist-tab/sidebar geometry, Spotify links and green hover/focus borders, menus, blurred popups and Cancel-last ordering, keyboard/focus behavior, loading/refresh/busy/error states, and motion/reduced motion. Test selected real service contracts only in an isolated environment; never use production data or send real notifications.

Treat blocked-user management and admin runtime health as intentionally excluded. Do not restore obsolete features just because residual code exists. Do not treat older parity checklists as proof; verify their claims against actual code and canonical Figma nodes.

Keep `docs/design-v2-testing-progress.md` updated with the feature checklist, final commit, commands/results, measured coverage, unresolved gaps and next slice. Persist through the necessary implementation and testing. Report infrastructure blockers accurately; do not mark unrun checks as passed. Fix failures without weakening existing release/security gates. Preserve unrelated local work.

Do not merge into `main`, deploy shared backend changes, alter stable releases/services/databases, or let the `/new` service worker capture stable URLs. Deliver the completed development changes and reviewable evidence; deployment requires separate explicit approval.

The final report must state what changed, actual verification results, per-suite coverage, Figma parity evidence and remaining limitations. Declare completion only when the plan's completion gates genuinely pass.
