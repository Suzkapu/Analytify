begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id, email) values
  ('35000000-0000-4000-8000-000000000001', 'compare-host@example.test'),
  ('35000000-0000-4000-8000-000000000002', 'compare-guest@example.test'),
  ('35000000-0000-4000-8000-000000000003', 'compare-attacker@example.test');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.create_compare_room(
  'room_1234567890_secure', 'host_1234567890_secure'
) $$, 'an authenticated host can create a private room');
select lives_ok($$ select public.create_compare_room_invitation(
  'room_1234567890_secure', 'invite_12345678', 'secret_123456789012345678901234'
) $$, 'the host can create a one-time hashed invitation');

select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.claim_compare_room_invitation(
  'room_1234567890_secure', 'invite_12345678', 'secret_123456789012345678901234', 'guest_1234567890_secure'
) $$, 'a second authenticated client can claim the invitation');
select throws_ok($$ select public.claim_compare_room_invitation(
  'room_1234567890_secure', 'invite_12345678', 'secret_123456789012345678901234', 'second_123456789_secure'
) $$, 'P0001', 'This Compare Room invitation is invalid, expired, used, or revoked.',
  'invitation replay is rejected');
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure', '{"type":"participant-state","participant":{"id":"host_1234567890_secure"}}'
) $$, 'P0001', 'Participant impersonation was rejected.',
  'a guest cannot impersonate the host participant');
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure', '{"type":"merge-proposal","proposal":{}}'
) $$, 'P0001', 'A guest cannot send this message type.',
  'a guest cannot send host-only proposal messages');
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure', jsonb_build_object(
    'type', 'participant-track-chunk', 'participantId', 'guest_1234567890_secure',
    'tracks', (select jsonb_agg('{}'::jsonb) from generate_series(1, 101))
  )
) $$, 'P0001', 'Track chunks are limited to 100 tracks.',
  'oversized guest chunks are rejected before storage');

select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure', '{"type":"save-result","participantId":"guest_1234567890_secure"}'
) $$, 'P0001', 'You are not an active member of this Compare Room.',
  'an authenticated outsider cannot inject room messages');
select is_empty($$ select * from public.compare_room_messages $$,
  'an authenticated outsider cannot read private room traffic');

select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  '{"type":"merge-proposal","proposal":{"id":"proposal_secure_01","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","trackCount":1,"tracks":[]}}'
) $$, 'the host can publish a bounded canonical proposal');

select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  '{"type":"proposal-approval","participantId":"guest_1234567890_secure","proposalId":"proposal_secure_01","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'
) $$, 'P0001', 'The approval does not match the active proposal.',
  'proposal hash substitution is rejected');
select lives_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  '{"type":"proposal-approval","participantId":"guest_1234567890_secure","proposalId":"proposal_secure_01","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
) $$, 'a guest can approve the exact active proposal');
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  '{"type":"proposal-approval","participantId":"guest_1234567890_secure","proposalId":"proposal_secure_01","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
) $$, '23505', null,
  'duplicate approval replay is rejected');

select set_config('request.jwt.claim.sub', '35000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  '{"type":"create-playlist-start","proposal":{"id":"proposal_secure_01","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","trackCount":1,"tracks":[]}}'
) $$, 'P0001', 'Every participant must approve this exact proposal.',
  'the host cannot substitute playlist content after approval');
select lives_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  '{"type":"create-playlist-start","proposal":{"id":"proposal_secure_01","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","trackCount":1,"tracks":[]}}'
) $$, 'the approved proposal can begin exactly once');
select throws_ok($$ select public.send_compare_room_message(
  'room_1234567890_secure',
  jsonb_build_object('type', 'create-playlist-track-chunk', 'proposalId', 'proposal_secure_01',
    'tracks', (select jsonb_agg('{}'::jsonb) from generate_series(1, 101)))
) $$, 'P0001', 'Track chunks are limited to 100 tracks.',
  'oversized host chunks are rejected before broadcast');

select * from finish();
rollback;
