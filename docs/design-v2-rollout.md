# Design v2 preview deployment and rollback

The user's 2026-10-04 release decision supersedes the earlier canonical-cutover
plan in #164: keep the original interface on `main`, keep all new design and
future development on `codex/design-v2`, and host that frontend only at `/new/`.
Do not merge the development branch into main or remove the stable interface.
The earlier issue's manual quality and staging evidence remains unverified;
this changed deployment boundary is not proof that those requirements passed.

## Release contract

- Normal non-prefixed routes serve main's independently built stable interface.
- `/new/*` serves the development artifact with base href and worker scope `/new/`.
- The preview owns one persistent Design v2 shell. Its internal canonical Angular
  routes resolve to browser URLs inside `/new/`, not to the stable interface.
- OAuth callbacks, share links, invite links, claims, and room links keep their stable identifiers.
- Preview deployment must not deploy migrations, Edge Functions, the sync worker,
  or the stable frontend. The existing backend is shared; incompatible backend
  experiments require a separate environment and explicit approval.

## Verification before activation

The exact preview artifact must pass `npm run verify:ci`, the preview Nginx tests,
and the Playwright browser suite in `.github/workflows/preview.yml`. Deployment
rejects superseded commits and artifacts with a base href or worker manifest
outside `/new/`. Releases are stored independently under their commit SHA.

After deployment, verify `/new/version.json` reports the development commit and
`/version.json` still reports the stable commit. Smoke-test both interfaces,
preview child routes, query/fragment preservation, and OAuth return handling.
Registered OAuth callback URLs remain stable; the stable callback guard forwards
preview requests before exchanging their code, preserving memory-only guest
sessions. Real-account OAuth evidence is distinct from mocked/unit checks.

## Atomic visual rollback

`scripts/deploy-preview.sh` retains immutable preview frontend releases and a
backup of the existing Nginx site file. It atomically changes only the dedicated
preview symlink, validates Nginx, reloads it, and checks the expected preview
commit with a bounded retry for graceful worker handover. A failed activation
restores the previous preview symlink and Nginx file. It does not change stable
release symlinks, the worker, database schema, or user data.

For an operator-requested preview rollback, use a development-branch revert of
the identified preview regression and let the verified preview workflow deploy
it. Confirm both version endpoints and both interfaces afterward. Do not reverse
database migrations or edit user data for a presentation rollback. A real staging
rollback rehearsal is still deferred; passing configuration tests alone does
not establish that evidence.

To retire the preview, remove its managed Nginx block and dedicated frontend
deployment only. Unregister only `/new/` workers and delete only `ngsw:/new/:`
caches; Angular's stock safety worker deletes stable caches too and must not be
used. Preserve releases until rollback is no longer needed.

## Post-release monitoring

Watch preview deployment health, navigation failures, OAuth errors, route-level
JavaScript errors, and LCP/INP/CLS separately from the stable interface. A preview
failure must not trigger a stable frontend or backend rollback.
