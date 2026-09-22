# Supply-chain policy

Analytify supports the current Angular release and the Node.js runtime declared in
`package.json`. Production and verification builds use the same Node release.

## Automated controls

- Every external GitHub Action is pinned to a reviewed 40-character commit SHA.
- Dependabot checks application, worker, and GitHub Action dependencies weekly.
- Dependabot opens major upgrades separately instead of hiding them. A major upgrade
  is merged only after its compatibility impact, migration work, rollback plan, and
  decision rationale are recorded in the pull request.
- CI requires every Supabase Edge Function to use the exact application
  `@supabase/supabase-js` version through an `npm:` import and verifies that the
  committed Deno lockfile resolves that version. The weekly runtime-currency audit
  opens one review issue when the pinned Deno runtime trails the latest stable Deno
  release.
- Pull requests receive dependency review and JavaScript/TypeScript CodeQL analysis.
- CI blocks high and critical npm advisories in both package-lock files.
- CI publishes CycloneDX SBOMs for the web application and sync worker for 90 days.
- Pull-request verification has read-only repository access and no production
  environment. Only the guarded `deploy-production` job can read production secrets.

Action updates must be reviewed for publisher, release notes, permissions, and the
resolved commit before the pinned SHA changes. Dependency updates must pass the full
verification workflow.

Major upgrades are review tasks, not routine updates. Their pull request must state
why the upgrade is needed now, identify breaking changes and required migrations,
show the focused and full-suite evidence, and name the tested rollback. If that
evidence is absent, the update remains open rather than being silently ignored or
merged.

## Exceptions

| Exception | Scope and mitigation | Owner | Expiry |
| --- | --- | --- | --- |
| TypeScript `skipLibCheck` | Temporary workaround for the Supabase Auth WebAuthn declaration conflict with TypeScript 6. Application and test sources remain strictly type-checked; Supabase updates are monitored weekly. | Analytify maintainers | 2026-12-31 |

Expired exceptions block release until removed or explicitly renewed with a new
rationale, owner, and expiry date.
