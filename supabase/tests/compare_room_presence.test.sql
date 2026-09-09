begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id, email) values
  ('35100000-0000-4000-8000-000000000001', 'presence-host@example.test'),
  ('35100000-0000-4000-8000-000000000002', 'presence-guest@example.test'),
  ('35100000-0000-4000-8000-000000000003', 'leaving-guest@example.test');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '35100000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.create_compare_room('room_presence_12345678', 'host_presence_12345678') $$,
  'host creates a presence-aware room');
select lives_ok($$ select public.create_compare_room_invitation(
  'room_presence_12345678', 'invite_presence', 'presence_secret_123456789012345678901234'
) $$, 'host creates an invitation');

select set_config('request.jwt.claim.sub', '35100000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.claim_compare_room_invitation(
  'room_presence_12345678', 'invite_presence', 'presence_secret_123456789012345678901234',
  'guest_presence_12345678'
) $$, 'guest claims the invitation');
select lives_ok($$ select public.touch_compare_room_presence('room_presence_12345678') $$,
  'an active guest can refresh presence');

select set_config('request.jwt.claim.sub', '35100000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.reconcile_compare_room_participants('room_presence_12345678')),
  0, 'a recently seen guest survives reconciliation');
select lives_ok($$ select public.send_compare_room_message(
  'room_presence_12345678',
  '{"type":"merge-proposal","proposal":{"id":"proposal_presence_01","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","trackCount":1,"tracks":[]}}'
) $$, 'host creates a proposal before the guest disconnects');

reset role;
update public.compare_room_members set last_seen_at = now() - interval '2 minutes'
where room_id = 'room_presence_12345678' and role = 'guest';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '35100000-0000-4000-8000-000000000001', true);
select is((select participant_id from public.reconcile_compare_room_participants('room_presence_12345678')),
  'guest_presence_12345678', 'the host reconciles a timed-out guest exactly once');
select is((select count(*)::integer from public.reconcile_compare_room_participants('room_presence_12345678')),
  0, 'a repeated reconciliation does not emit a duplicate departure');

reset role;
select ok(not (select active from public.compare_room_members
  where room_id = 'room_presence_12345678' and role = 'guest'),
  'the disconnected guest no longer occupies a member slot');
select ok((select revoked_at is not null from public.compare_room_invitations
  where room_id = 'room_presence_12345678' and invitation_id = 'invite_presence'),
  'the claimed invitation is retired so the host can create a fresh slot');
select is((select status from public.compare_room_proposals
  where room_id = 'room_presence_12345678' and proposal_id = 'proposal_presence_01'),
  'cancelled', 'a departure atomically invalidates the active proposal');
select is((select payload->>'reason' from public.compare_room_messages
  where room_id = 'room_presence_12345678' and payload->>'type' = 'participant-left'),
  'disconnected', 'reconciliation records a clear departure reason');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '35100000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.create_compare_room_invitation(
  'room_presence_12345678', 'invite_leaving', 'leaving_secret_123456789012345678901234'
) $$, 'host creates a fresh invitation after the stale slot is freed');
select set_config('request.jwt.claim.sub', '35100000-0000-4000-8000-000000000003', true);
select lives_ok($$ select public.claim_compare_room_invitation(
  'room_presence_12345678', 'invite_leaving', 'leaving_secret_123456789012345678901234',
  'guest_leaving_123456789'
) $$, 'another guest can take the freed slot');
select lives_ok($$ select public.leave_compare_room('room_presence_12345678') $$,
  'explicit leave succeeds');
reset role;
select ok(not (select active from public.compare_room_members
  where room_id = 'room_presence_12345678' and user_id = '35100000-0000-4000-8000-000000000003'),
  'explicit leave immediately frees the member slot');
select is((select payload->>'reason' from public.compare_room_messages
  where room_id = 'room_presence_12345678' and payload->>'participantId' = 'guest_leaving_123456789'),
  'left', 'explicit leave records a distinct user-facing reason');

select * from finish();
rollback;
