# Development and stable releases

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
