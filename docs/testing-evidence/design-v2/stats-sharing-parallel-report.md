# Stats Sharing boundary characterization — 21 October 2026

Scope: `src/app/core/sharing/stats-sharing.service.ts`, existing spec plus new `stats-sharing-transport-boundary.spec.ts`. No hosted endpoints, external data, database, real notifications or Realtime connections are used. Installed Supabase SDK constructs and decodes serialized RPC requests through an origin-restricted synthetic fetch boundary. This verifies frontend request/response/error handling, not server authorization enforcement.

Read AGENTS.md, tested design implementation plan, Figma-first workflow, development/release boundaries and feature-gap audit before edits. Reviewed the existing fifteen tests, service/models, stats migrations (initial requests/snapshots, response concurrency fix, private discovery/request limits, private request/share links), and caller acceptance behavior. No interface, canonical design or production schema change belongs to this characterization slice. No paging API exists here: snapshot SQL selects one latest snapshot and ordered nested arrays.

## Baseline

`stats-sharing-parallel-baseline.log`: exit 0, 15 tests / 1 file. Coverage L/S/F/B **100 / 78.74 / 100 / 58.10%** (90/90 lines; 100/127 statements; 33/33 functions; 86/148 branches). All service application code included. The baseline source SHA256 is `a9439b793acdcf46f6a99a813e3e04d8ba90939dad1b4ed52006e51dec7b2833`.

## Cases added

- Structured SQL permission failures survive real SDK decoding for each active stats/consent/moderation RPC, with no fallback success or extra writes; invitation creation failures cannot expose a usable claim link.
- Both owner and viewer request records retain status/timestamps; nullable profiles use safe presentation defaults. A search result cannot substitute for an explicit approved stats grant.
- Privacy settings distinguish explicit true from absent/false; successful empty lists remain empty.
- No saved snapshot remains distinct from an existing snapshot with empty arrays. Ranked nested Spotify track/artist metadata, requested range and canonical owner identity survive decoding. Legacy counts normalize while existing percentage weights and real zero weights remain intact.
- Missing IDs, malformed previews and incomplete moderation receipts cannot masquerade as success. Private moderation notices retain appeal and resolution dates.
- Failed approval retries remain explicit; transient snapshot failures permit fresh recovery. Concurrent owner/range responses remain isolated when completed out of order.

SQL inspection establishes the intended permission rule: `get_shared_stats_snapshot` requires an approved explicit owner/viewer record and `revoked_at is null`. Friendship is absent from that gate. The synthetic tests only verify frontend propagation of that gate's response; local/isolated SQL execution remains outstanding.

## Verification state

After correcting a harness-only RPC regex (versioned `report_stats_user_v2` contains a digit), initial companion verification was exit 0: **59 tests / 2 files**, L/S/F/B **100 / 97.63 / 100 / 93.24%** (90/90;124/127;33/33;138/148). See `stats-sharing-parallel-tests.log` and dedicated coverage reports. The final scoped measurement below supersedes this intermediate result.

`stats-sharing-parallel-red.log`: exit 1, **45 passed / 1 failed**. `acceptShareInvite` resolved an empty string for a successful null response. SQL's contract returns the accepted request UUID; the caller ignores the resolved value and navigates to success. With explicit parent approval the service now rejects missing acceptance identity. Subsequent scoped run exit 0: **62 tests / 2 files**, L/S/F/B **100 / 97.69 / 100 / 94.66%** (92/92;127/130;33/33;142/150), including mixed-zero count and concurrent completion cases. Production source SHA256: `6d675906acd1ab1f470d60d128440c3ba5f91310c0619724adac565850b777c3`.

Separately, `stats-sharing-parallel-session-red.log` reproduces an actual lifecycle defect using public `SessionLifecycleService.invalidateAndDrain`, Angular DI, real SDK token lookup and an abort-aware synthetic fetch. Suspending client readiness, invalidating the old session, then resolving readiness after the actor changes dispatches `answer_stats_access_request` with `Bearer synthetic-new-owner`. The test requires no dispatch and rejection; source currently dispatches and resolves. This is not hosted SQL authorization evidence; it proves an old UI action survives the application's public session boundary. The second RED also suspends the SDK access-token callback and reproduces an old revoke dispatch under the new token. With explicit parent approval, the retained active RPCs now share a generation boundary: capture synchronously before client readiness, assert after readiness, attach the real RPC AbortSignal before SDK token lookup, and reject any decoded result from the old generation. Both REDs are now GREEN. No optional lifecycle/security bypass or independent production lifecycle instance was added.

The final remaining eight uncovered branches comprise legacy blocked-user management (six branches, intentionally excluded product workflow), the unreachable-for-normal-nonnegative-count zero-total normalization case, and the Realtime UUID compatibility fallback. No coverage exclusion, ignore annotation, disabled test or weakened assertion is used. The false zero-total branch requires nonfinite/invalid or negative numeric data to bypass the percentage branch; do not manufacture such payloads solely for branch coverage. This slice does **not** meet the 98% branch gate and does not claim overall completion.

Official RPC docs reviewed: https://supabase.com/docs/reference/javascript/rpc . Changelog fetch attempted: web parser rejected Markdown content type, sandbox curl could not resolve supabase.com. Installed SDK `fetchWithAuth` source was inspected directly. No SDK dependency/API upgrade is made.

## Commands

```sh
npx ng test --watch=false --progress=false --include='src/app/core/sharing/stats-sharing*.spec.ts' --include='src/app/features/insights/user-stats/stats-shared-recipient-boundary.spec.ts' --runner-config=docs/testing-evidence/design-v2/stats-sharing-parallel-vitest.mjs --coverage --coverage-include='src/app/core/sharing/stats-sharing.service.ts' --coverage-reporters=json-summary --coverage-reporters=json --coverage-reporters=text-summary
npx ng test --watch=false --progress=false --include='src/app/core/sharing/stats-sharing-transport-boundary.spec.ts' --runner-config=docs/testing-evidence/design-v2/stats-sharing-parallel-vitest.mjs
npx ng test --watch=false --progress=false --include='src/app/features/**/stats-*-claim.component.spec.ts' --include='src/app/features/insights/user-stats/*.spec.ts' --runner-config=docs/testing-evidence/design-v2/stats-sharing-parallel-vitest.mjs
npm run typecheck:tests
npm run stats-sharing:check
npx eslint src/app/core/sharing/stats-sharing.service.ts src/app/core/sharing/stats-sharing.service.spec.ts src/app/core/sharing/stats-sharing-transport-boundary.spec.ts src/app/core/sharing/stats-sharing-session-boundary.spec.ts src/app/features/insights/user-stats/stats-shared-recipient-boundary.spec.ts
```

## Final frozen verification

- **81 passed / 4 files**, exit 0. Coverage L/S/F/B **100 / 98.08 / 100 / 94.77%** (100/100;154/157;52/52;145/153). See final scoped test log, dedicated coverage reports and `stats-sharing-parallel-result.json` source/report SHA manifest. This includes 57 new tests in two companion specs plus the original fifteen service and nine recipient cases.
- **263 passed / 17 files**, exit 0: broader Stats recipient/claim/component regression. This overlaps the scoped recipient cases and is not an additive unique-test count.
- Full test TypeScript check, targeted ESLint and existing stats-sharing contract gate: each exit 0. Scoped diff whitespace check: exit 0.
- Final application source SHA256: `977923feec9e1da1a4570665e38f6cfb72afce05c5e0648d75c0b388b2b8347e`.

Only production change is this Stats Sharing service. Fixture-only approved adaptations affect `src/app/core/sharing/stats-sharing.service.spec.ts` (RPC stubs now implement AbortSignal-aware thenable contracts) and `src/app/features/insights/user-stats/stats-shared-recipient-boundary.spec.ts` (same adapter and Angular DI construction). All their existing assertions and test intents were preserved. New specs are `stats-sharing-transport-boundary.spec.ts` and `stats-sharing-session-boundary.spec.ts` under the core sharing directory. The final constructor resolves the real Angular DI lifecycle by default; direct construction must supply a real lifecycle or run inside Angular DI, as the fixture now does.

## Remaining limits and next slice

No hosted Auth/Realtime/SQL/RLS execution, browser/Figma parity claim or all-suite completion. Final combined regression and application-wide 98% gates belong to parent scheduling. No commit, push, merge or deployment performed.

Realtime subscription is intentionally separate from the RPC boundary and unchanged. The sole retained caller, SharedPlaylistsComponent, gates callback reloads on its destroyed flag, disposes subscriptions on destruction and immediately disposes a registration that resolves after destruction. Existing component regression verifies late registration cleanup. The service itself has no lifecycle check around delayed registration or callbacks; invalidation without component destruction remains a followup risk. No claim that all service/session ownership is solved. Stale rejected getClient/SDK errors also retain their original error rather than being rewritten to a session-changed message; they do not return stale private success data.

Next slice: independently evaluate retained Realtime subscription ownership/caller destruction around actual logout; run isolated SQL/RLS consent contracts if infrastructure becomes available; leave excluded blocked-user workflows untouched. No fabricated payloads, private-method calls or coverage exclusions were used to reach a metric.
