# Stats Realtime session ownership — 23 October 2026

This bounded followup tests the retained Stats Sharing Realtime subscription against the public `SessionLifecycleService` and actual `SharedPlaylistsComponent` lifecycle. It uses isolated channel/RPC boundary fixtures; no hosted endpoint, WebSocket connection, production data or notification is used. It does not establish hosted Auth, Realtime authorization, SQL/RLS or Figma parity.

Read current AGENTS.md, tested implementation plan, Figma-first workflow, release boundaries and gap audit before editing. Branch: `codex/design-v2`; checkpoint at investigation: `5cf06aa`. The previous RPC source SHA was `977923feec9e1da1a4570665e38f6cfb72afce05c5e0648d75c0b388b2b8347e`. Earlier full CI and `stats-sharing-parallel-*` evidence are historical and untouched.

## Public reproduction and approved change

Initial source failed three of five cases: delayed client readiness registered a channel after session invalidation; an old active channel invoked its callback after session end; the still-mounted retained sharing component reloaded workspace data from that old event. Existing component-destruction disposal and independence of the next account channel already passed.

After adding explicit caller recovery and cleanup rejection behavior, the final RED was **4 failed / 3 passed**, exit 1 (`stats-sharing-realtime-red.log`). Cleanup rejection was neither caught nor reported. These tests use public service calls, actual Angular DI lifecycle invalidation and actual caller initialization/destruction. No private state mutation or compliance flag override is used; the existing operator-enabled retained branch runs as configured.

With explicit parent approval, the only production change is `src/app/core/sharing/stats-sharing.service.ts`:

- Capture the generation before awaiting client readiness; reject stale registration immediately afterward.
- Guard notifications against disposed/stale generations.
- Attach session-abort cleanup to the same idempotent callback returned to callers. Cleanup detaches its abort listener and removes only its exact channel.
- Catch asynchronous channel-removal rejection and report it through the existing scoped/redacting logger. Local notification suppression remains effective even if remote cleanup fails.

Existing RPC logic, legacy blocked-user methods, caller UI, feature/security gates and backend/schema files are unchanged. No commit, push, merge or deployment was made.

## Actual verification

All commands completed after the approved production edit:

| Check | Result |
| --- | --- |
| New focused Realtime boundary spec | Exit 0; **7 passed / 1 file** |
| Affected service, recipient and retained caller regression | Exit 0; **116 passed / 6 files** |
| Full test TypeScript check | Exit 0 |
| Targeted ESLint | Exit 0 |
| Existing stats-sharing contract gate | Exit 0 |
| Scoped whitespace/diff check | Exit 0 |

Fresh service-only V8 coverage: **lines 100% (108/108), statements 98.18% (162/165), functions 100% (53/53), branches 94.83% (147/155)**. This includes the whole service source. No coverage exclusions, ignore annotations, disabled tests or weakened assertions were added. The eight uncovered branches are six in excluded legacy blocked-user management, the zero-total normalization branch requiring invalid normal count assumptions, and the Realtime UUID compatibility fallback. Branch coverage remains below 98%; this slice and the overall migration are not declared complete.

The seven new cases cover delayed registration after session end, active callback suppression/channel cleanup, old cleanup versus a new generation channel, mounted caller invalidation, next-generation caller recovery, asynchronous removal rejection, and component destruction before registration completes. Existing service and caller assertions remain unchanged.

Final source SHA256: `d0d0703c376e45b881abe10c00eddeae8dd6e84755358950130fc030091628d4`. Source/config/report/log hashes and exact measured totals are in `stats-sharing-realtime-result.json`. No live commands remain.

## Commands

```sh
npx ng test --watch=false --progress=false --include='src/app/core/sharing/stats-sharing-realtime-boundary.spec.ts' --runner-config=docs/testing-evidence/design-v2/stats-sharing-realtime-vitest.mjs
npx ng test --watch=false --progress=false --include='src/app/core/sharing/stats-sharing*.spec.ts' --include='src/app/features/insights/user-stats/stats-shared-recipient-boundary.spec.ts' --include='src/app/features/shared-playlists/shared-playlists.component.spec.ts' --runner-config=docs/testing-evidence/design-v2/stats-sharing-realtime-vitest.mjs --coverage --coverage-include='src/app/core/sharing/stats-sharing.service.ts' --coverage-reporters=json-summary --coverage-reporters=json --coverage-reporters=text-summary
npm run typecheck:tests
npx eslint src/app/core/sharing/stats-sharing.service.ts src/app/core/sharing/stats-sharing-realtime-boundary.spec.ts
npm run stats-sharing:check
git diff --check -- src/app/core/sharing/stats-sharing.service.ts src/app/core/sharing/stats-sharing-realtime-boundary.spec.ts
```

## Limits and next slice

Cleanup suppresses local notifications immediately; it does not claim remote unsubscribe completed before `invalidateAndDrain` resolves. Installed SDK `RealtimeClient.removeChannel` awaits `channel.unsubscribe()` and may return `ok`, `timed out` or `error`; the existing no-retry behavior for returned failure statuses remains unchanged. A rejected removal is now handled/logged. No forced shared-client disconnection or new retry policy is introduced.

No broad frontend suite, browser/Figma comparison, worker/edge measurement or hosted contract run was performed in this slice. Parent must run final combined CI against the new source before replacing any earlier full-CI claim. Isolated hosted Realtime authorization/token-transition evidence remains outstanding.
