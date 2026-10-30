# Pending-registration review next-slice audit

Follow-up30October: same-user busy lifetime defect below is reproduced and fixed (10RED,68focusedPASS,2586fullfrontendPASS). Other listed recovery/dialog/contract gaps remain. See admin-pending-review-lifetimes-current-result.json.

Read-only source inspection, 30 October 2026. No SQL or browser executions performed for this audit. The existing confirmation is legacy window.confirm; the next slice must first finish canonical dialog states, then replace it without weakening the safety boundaries below.

## Authoritative contracts

`src/app/features/admin/admin.component.ts:328–354`: request server review, reject ineligible result, confirm exact reviewed Spotify identity, call delete RPC with user UUID plus reviewed identity, read current inventory, and publish only addressed user removal while preserving other drafts. Route/full-refresh ownership is checked after each awaited effect.

`src/app/core/admin/admin.service.ts:163–180`: review calls `admin_review_pending_spotify_profile({p_user_id})`; eligibility requires literal boolean true, malformed blockers are filtered to strings. Delete calls `admin_delete_reviewed_pending_spotify_profile({p_user_id,p_expected_spotify_id})`. RPC errors propagate.

`supabase/migrations/20260924210000_reviewed_pending_profile_cleanup.sql`:
- Lines23–27: review requires `private.is_app_admin(auth.uid())` (42501); missing profile is P0002.
- Lines29–40: block non-pending Spotify IDs, verified Spotify identity, backup active or stored refresh credentials, and registrations newer than15minutes. Exactly15minutes is not rejected by that age predicate.
- Lines42–61: inspect actual public foreign keys referencing public.users, excluding sync_user_settings only; every positive linked-row count becomes a blocker. No generic-display-name deletion heuristic.
- Lines63–64: eligible iff blocker array is empty; return current server Spotify identity and creation timestamp.
- Lines75–82: delete independently checks admin; SELECT FOR UPDATE locks profile; missing profile P0002; identity differing from reviewed expectation rejects40001.
- Lines83–87: delete reruns authoritative review and rejects23514 if no longer eligible.
- Lines88–91: audited deletion then auth.users deletion occur in same RPC transaction; missing auth identity raisesP0002 rather than reporting success.
- Lines95–98: revoke public/anon execution; authenticated callers still require internal admin guard.
- Lines1–11: cleanup audit has RLS and no public/anon/authenticated table privileges.

Automatic service-role cleanup in `20260928030000_defer_anonymous_profile_creation.sql` is a distinct existing workflow, not a new UI capability. Do not invoke it from the dialog or deploy migration changes as part of frontend work.

## Intended behavior and tests that must survive

- Review first; no frontend inferred eligibility. Ineligible reviews preserve row and show server blocker reasons; no destructive confirmation.
- Cancel causes no delete and no inventory refresh.
- Confirm uses review.spotifyId, never the mutable local card's identity.
- Duplicate reviews and deletes suppressed while effect pending.
- After deletion, only absent addressed user disappears; other users' unsaved drafts survive.
- A stale review cannot open a dialog/delete after route destruction or newer full refresh; late delete cannot initiate private readback on destroyed route.
- Server identity/linked-data denial retains cached row and displays error.

Existing tests:
- `admin-mutation-boundaries.spec.ts:125–165`: ineligible no-confirm/no-delete; Cancel no-delete/no-readback; exact server identity; duplicate review; server denial retains row.
- `admin-action-lifecycle-boundaries.spec.ts:100–117`: route destruction during review or confirmed deletion suppresses later confirmation/private reads/messages.
- Same file209–219: addressed deletion does not replace unrelated draft timezone;221–231 already-destroyed component starts no effect.
- `admin-user-draft-ownership.spec.ts:247–259`: older policy inventory does not resurrect reviewed-deleted profile.
- `admin.component.spec.ts:211–249`: mounted pending identity, eligible deletion and linked-data denial.
- `admin-user-card.component.spec.ts:150–161`: pending-only Review emits without itself authorizing deletion; busy Review blocks activation.
- `admin-service-boundaries.spec.ts:149–175`: literal eligibility, malformed blockers, missing result fail-closed, exact arguments, RPC error propagation.
- `supabase/tests/pending_profile_cleanup.test.sql`:10PgTAP assertions covering anonymous profile deferral, ordinary-user review denial, eligible old/recent protection, changed identity denial, successful admin cleanup, automatic cleanup and retained audit evidence. These were inspected, not rerun by this audit.

## Defects to reproduce before fixing; do not characterize as intended behavior

1. Same-user concurrency: `isUserBusy` currently includes savingUsers/queueingUsers only; review entry only checks reviewingUsers. Save/Run can overlap a review/delete and Review can begin during Save/Run. Add failing lifetime tests first for both directions, then consistent mutual exclusion through review, dialog, delete and readback. Independent users should remain independent.
2. Acknowledged delete + readback failure: delete may succeed, then three-part private inventory read fails. Current generic catch labels it review failure, retains stale row and permits another review. Reproduce first; introduce explicit acknowledged-deletion/read-only recovery and prevent repeated destructive mutation while recovering. Preserve unrelated drafts even after repeated recovery failures.

## Missing dialog/browser/service checks

- Canonical reviewing, eligible confirmation, blocked, deleting, delete denial, acknowledged-delete/read error and recovery states. Avoid exposing delete before eligible review.
- Dialog initial safe focus, trap, Escape/Cancel, Cancel-last ordering, blur/backdrop, keyboard activation, short-window scrolling, responsive geometry and correct focus restoration. Close/supersession must clear any live pending confirmation.
- Held-dialog interleavings: full Refresh, route destruction, reviewed identity changes, duplicate confirmation, another user review; stale completions must not overwrite current UI.
- Actual isolated review/delete browser fixture with exact write allowlist and held RPC responses; no real users or notifications.
- SQL expansion in isolated environment: direct non-admin delete denial, each individual linked/verified/credential/backup blocker, eligibility changing after review, concurrent identity/data changes, missing auth identity and transaction rollback. Existing tests do not establish those cases.
