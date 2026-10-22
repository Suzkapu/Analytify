# Friends contract investigation — 11 October 2026

This records inspected requirements and implementation constraints. It is not a
claim that friendship persistence or a Friends route exists or has passed tests.

Canonical references: Friends desktop `192:11403`, mobile `192:11528`; Add friend
`192:11619` / `192:11744`; Invitations `192:11835` / `192:11960`; invitation review
`192:12051` / `192:12176`. The retained text/action inventory is
`friends-canonical-workflow-inventory.json`.

## Verified privacy boundary

Friendship is mutual social membership. Accepting it must not create a Stats
access grant, expose listening data, copy playlists, or send notifications.
Existing `StatsSharingService` invitations operate on private-data access;
they cannot stand in for the missing friendship API.

Canonical removal dialogs `473:29338`, `473:29396`, `473:29454`, `473:29512`
remove the selected friend and allow a later request. Their affirmative action
changes only prototype friend/selection variables and closes the overlay;
Cancel closes it without those changes. All four put Cancel after Remove friend.
They do not specify revoking separately granted data access. Preserve those
independent grants; the Private Sharing workflow owns explicit revocation.
Prototype-only explanatory copy must not become a live product promise.

Revoking an invitation disables its link and QR and leaves existing friendships
intact. Review must identify the inviter before acceptance. Unavailable links
must support asking for a new invitation rather than silently adding a friend.

## Required service behavior before mounting the route

- Use the authenticated registered identity, never a caller-supplied acting user
  or user-editable JWT metadata. Existing profiles map `public.users.id` to
  authenticated identities and uniquely identify Spotify accounts.
- Keep friendship rows and invitation secrets independent of all private-data
  grant tables. Restrict reads and mutations to the participating identities.
- Create cryptographically random claim tokens; persist only token hashes.
  Do not log or include live invitation secrets in test evidence.
- Reject self acceptance and unavailable/revoked invitations. Only an owner may
  revoke their invitation; only a participant may remove a connection.
- Acceptance and revocation must serialize around the invitation. Concurrent
  duplicate acceptance must create one mutual connection. Recovery after a lost
  response must not duplicate a connection or regrant unrelated data.
- User clarification on11 October: each invitation is for exactly one person;
  the sender may revoke the pending friend request at any time. Acceptance
  consumes the invitation atomically. A second recipient cannot reuse it; the
  same recipient may safely retry a completed acceptance after a lost response.
  No automatic expiry was requested. After acceptance, Remove friend governs
  the connection; pending-request revocation does not replace that action.
- Declining an invitation must not create a friendship or a private-data grant.
  Canonical pending/busy/revoked/consumed/error states must make these decisions
  visible before the route is mounted.
- Ignore stale responses after actor/session replacement; keep cached rows while
  refreshing; distinguish loading, empty, busy, permission and retryable failure.
- Include real database permission, concurrent acceptance/revocation, malformed
  input and independent-grant preservation tests using synthetic profiles only.

## Infrastructure and limits

Initial executable inventory found no postgres/initdb/psql/PostgREST or container
runtime on PATH. Supabase CLI is present, but its container environment is not.
An isolated native PostgreSQL18.6 runtime beneath `/tmp` now runs selected real
profile migrations and permission contracts (six outcome groups, EXIT0);
no hosted integration has been run and no production fallback is permitted.
This cannot certify hosted Auth, PostgREST, realtime or deployment compatibility.

The CLI-generated local migration
`supabase/migrations/20261011162823_design_v2_single_use_friend_invitations.sql`
now implements creation, read-only preview, atomic accept/decline, owner revocation,
participant removal and bounded owner/participant listing through guarded RPCs.
Private tables have no browser access. RPCs require a verified registered profile;
all bearer tokens are hashed before persistence. A creation retry reuses its token
and never reactivates a revoked/consumed request. A response retry returns the
saved decision only to the same recipient and never restores removed membership.

Accepted/declined/revoked decision records and removal markers persist for related
profiles' lifetimes to prevent replay. They contain identifiers, hashes and times,
not copied profile/Stats/playlist payloads. Profile deletion cascades the rows.
Twenty pending invitations per owner bounds active requests; concurrent creation
is serialized on the owner profile. Revocation releases capacity. This bound is a
resource safeguard, not a change to single-person invitation semantics.

`friends-service-native-result.json` records14 tested outcome groups with actual
migration/runner hashes, including real Stats/playlist grant preservation, native
lock barriers, both acceptance/revocation orderings, same-actor retries, rollback,
quota recovery and profile cascades. Initial creation contract failed against the
empty migration; later native contracts pass. Auth/table/verified-column fixtures
and selected historical migration prerequisites are explicit limitations.

Canonical Add friend/Invitations desktop/mobile status copy now makes one-person
and pending revocation semantics explicit. Reviewed mobile screenshot and changed
text bounds are retained in `friends-single-use-canonical.json`.

Current incoming request contract: opening a link reserves it for one verified
recipient without accepting. The recipient can later list and answer it by request
ID; another actor cannot preview, receive or answer it. Owner revocation and
recipient decline remove it from the pending inbox. Current native evidence is
`friends-incoming-native-result.json`:17 outcome groups with updated source hashes,
including competing receivers and related-recipient erasure.

Canonical feedback1008:32348 and desktop/mobile review1008:32349 define seven
recovery states, extended by earlier-session link-unavailable1009:32386. The
actor-bound RPC adapter requires explicit isolated-backend readiness, disabled by
default, and never persists bearer tokens or calls private-grant APIs. Latest
mounted/controller/layout verification passed72 tests across4 files, including
receive Retry publication, delayed QR replacement, explicit consumed-link
replacement and confirmed decision outcomes after account change
(`friends-recovery-result.json`). Earlier adapter/feedback/navigation results are
retained separately; these selected counts must not be added into a full-suite
claim. Sixteen bounded native phase cases passed with real QR rendering and SDK RPC
boundaries mocked only at loopback (`friends-browser-result.json`). The latest
whole-app run passed1526 runnable tests and all48-source zero-uncovered budgets.
Every whole-application98% metric remains below target. It includes the current production fixes. Hosted transport, independent QR decoding,
full retained migrations and complete Figma parity remain unverified. The latest
native matrix additionally holds confirming-inbox and actual signout responses,
proving revoked previews disappear and logout clears secrets before signout
finishes. The earlier mobile/reduced-motion DOM-update timeout remains unresolved;
the recovery observer continues to reject timeouts and failed DOM updates.

Removal is conditional on the captured connection version. Genuine reconnection
rotates that UUID; acceptance retry for an active connection preserves it. An old
removal retry can only match its old connection, even when waiting on a row lock
while a reconnection commits. Current evidence is friends-removal-native-result.json
(18 native outcome groups); the retained RED proves the prior user-ID-only operation
removed a later connection. Migration remains local and undeployed.
