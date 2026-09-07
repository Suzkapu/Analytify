# Testing strategy

CI keeps the fast source-pattern diagnostics while release verification also executes behavior at the boundary that owns it:

| Risk | Executed boundary |
| --- | --- |
| Browser workflows, cancellation, stale responses, and fault fallbacks | Angular/Vitest in isolated jsdom environments |
| Queue concurrency, leases, provider faults, and task cancellation | Node's test runner against sync-worker modules |
| Edge authorization, request validation, and push delivery failures | Deno tests with mocked provider boundaries |
| RLS, grants, quotas, compare-and-swap writes, and concurrent database state | PgTAP after rebuilding every migration from an empty database |
| Supabase-first browser loading | Angular integration tests against an isolated local Supabase stack |
| Release activation and rollback policy | Node tests around deployment scripts |

The browser coverage baseline is ratcheted by `scripts/check-coverage-thresholds.mjs`. A change may raise those four values; it must not lower them. CI publishes HTML and LCOV coverage together with the exact Node, npm, Deno, and Chrome versions for 14 days.

## Critical-path burn-down

The following paths must receive focused tests before the global threshold is raised again:

- PWA service-worker update acceptance and failed reload recovery.
- Complete Stats page keyboard interaction in a real browser viewport.
- Compare Room reconnect after a network transition during proposal transfer.
- Push-provider rate limiting across multiple Edge Function instances.
- Production deployment rollback after schema succeeds but worker activation fails.

New security or concurrency fixes require an adversarial regression test at the real boundary. Source-text checks provide fast local hints, but cannot substitute for that test.
