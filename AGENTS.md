# Branch and release boundaries

- All new features, redesign work, and experiments belong on `codex/design-v2`.
- `main` contains the original stable interface, not the `/new` presentation.
- Never merge the development branch into main or deploy its backend changes to
  the shared production backend without explicit user approval.
- Main changes are limited to approved stable fixes and release infrastructure;
  select fixes individually and run its full verification before deployment.
- The `/new` frontend must have a separate build and deployment, must not register
  a service worker that captures stable URLs, and must not mutate stable releases,
  worker services, or database deployments.
- See `docs/development-and-releases.md` for release boundaries.
