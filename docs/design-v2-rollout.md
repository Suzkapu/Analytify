# Design v2 canonical rollout and rollback

## Release contract

- Canonical non-prefixed routes mount the single Design v2 shell.
- `/new/*` performs a routing-only compatibility redirect with its query parameters and fragment intact.
- OAuth callbacks, share links, invite links, claims, and room links keep their stable identifiers.
- Database migrations and shared domain services are independent of the presentation cutover.

## Verification before activation

The exact production artifact must pass `npm run verify:ci` and the Playwright browser suite. CI rebuilds the database from empty, runs PgTAP, verifies the worker artifact, checks canonical and compatibility routes, and then stores the immutable web and worker releases under their commit SHA.

After deployment, verify `/version.json` and worker `/health` both report the expected commit, then smoke-test canonical login, playlists, stats, history, sharing, Compare Room, Song League, one `/new/*` redirect with query and fragment, and OAuth return handling.

## Atomic visual rollback

The server keeps immutable web and worker release directories. `scripts/activate-release.sh` changes only the `current` symlinks, verifies both health endpoints, and automatically restores the previous web and worker targets if activation fails. Its rollback behavior is covered by `scripts/activate-release.test.mjs` and the deployment-policy test suite.

For an operator-requested rollback, redeploy the last known-good commit through the same verified workflow or invoke the release activation process with that commit's already-built web and worker directories. Do not reverse database migrations or edit user data for a presentation rollback. Confirm `/version.json`, worker `/health`, login, and one authenticated canonical route after activation.

This restores a complete accessible product shell rather than mixing a new database with an old partial checkout. The `/new/*` compatibility matcher remains available in the known-good release during the agreed transition period.

## Post-release monitoring

Watch deployment health, navigation failures, OAuth callback errors, route-level JavaScript errors, LCP/INP/CLS, and `/new/*` compatibility traffic. Treat accessibility, routing, or performance regressions as release regressions and use the atomic rollback path when they cannot be corrected immediately.
