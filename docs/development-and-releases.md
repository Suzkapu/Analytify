# Branch-selected root frontend releases

On 30 October 2026 the user explicitly authorized replacing the root website with
Design v2 and retaining the ability to switch back by running the main pipeline.
This supersedes the former `/new/` hosting boundary below; branch and backend
isolation remain in force.

- Run **Verify and deploy v2 root frontend** (`preview.yml`) on `codex/design-v2`
  with `friends_contract_only: false` to publish v2 at `/`.
- Run **Verify and deploy** (`deploy.yml`) on `main` to restore the original
  interface. Main remains unchanged. Its existing full production pipeline also
  retains its existing backend release steps; v2 never runs those steps.
- Both jobs serialize activation using `analytify-production` and select the same
  frontend target symlink. Each branch retains its own immutable artifacts.
- V2 uploads only its frontend, preserves previous content-hashed assets, validates
  the existing HTTPS root, and rolls back the frontend/config on activation failure.
- Old `/new/` links redirect to root paths. A narrowly scoped retirement worker
  unregisters only the `/new/` registration and deletes only `ngsw:/new/:` caches.
  The selected root frontend supplies `/ngsw-worker.js` with scope `/`.
- Existing verification/security gates remain required. Stopping local tests does
  not certify the migration or bypass release gates. Deployment is not successful
  until the pipeline activates the artifact and verifies its commit at `/version.json`.

## Historical preview boundary (before the authorized root promotion)

`main` is the stable, original interface. The redesigned interface and future
feature development belong on `codex/design-v2`, hosted separately at `/new/`.
The branch started from main commit `409bde7` before restoring the original UI.

Do not merge the development branch into main. Main's release-isolation check
rejects preview presentation files and imports. Approved fixes for the original
site must be selected individually, verified against that interface, and released
through its existing green-build-only deployment pipeline.

The preview must deploy only its own frontend artifact: never production database
migrations, Edge Functions, the synchronization worker, or the stable web release.
Both frontends may use the existing backend; incompatible backend experiments
require a separate backend environment before testing.

Removing the preview means removing its Nginx location and its separate frontend
deployment. The stable application's source and release do not depend on it.

The preview uses its own `/new/` service-worker scope and `ngsw:/new/:` caches.
When retiring it, unregister only that scope and remove only those caches.
Do not use Angular's stock safety worker: it deletes all Angular caches on the
origin, including the stable site's caches. Keep existing release directories
until the preview has been retired and no rollback is needed.
