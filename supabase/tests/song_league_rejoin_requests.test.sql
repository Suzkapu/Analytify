begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(id, email) values
  ('76100000-0000-4000-8000-000000000001', 'rejoin-owner@example.test'),
  ('76100000-0000-4000-8000-000000000002', 'rejoin-member@example.test'),
  ('76100000-0000-4000-8000-000000000003', 'rejoin-other@example.test'),
  ('76100000-0000-4000-8000-000000000004', 'rejoin-outsider@example.test');
update public.users set backup_active = true, display_name = case id
  when '76100000-0000-4000-8000-000000000001' then 'Owner'
  when '76100000-0000-4000-8000-000000000002' then 'Returning member'
  when '76100000-0000-4000-8000-000000000003' then 'Other member'
  else 'Outsider' end where id::text like '76100000-%';
insert into public.song_leagues(id, owner_user_id, name, max_members) values
  ('76200000-0000-4000-8000-000000000001', '76100000-0000-4000-8000-000000000001', 'Rejoin flow', 3);
insert into public.song_league_members(league_id, user_id, role, display_name, left_at) values
  ('76200000-0000-4000-8000-000000000001', '76100000-0000-4000-8000-000000000001', 'owner', 'Owner', null),
  ('76200000-0000-4000-8000-000000000001', '76100000-0000-4000-8000-000000000002', 'member', 'Returning member', now()),
  ('76200000-0000-4000-8000-000000000001', '76100000-0000-4000-8000-000000000003', 'member', 'Other member', null);
insert into public.song_league_invites(id, league_id, token_hash, created_by, expires_at, usage_policy) values
  ('76300000-0000-4000-8000-000000000001', '76200000-0000-4000-8000-000000000001',
   encode(extensions.digest(convert_to(repeat('r', 64), 'UTF8'), 'sha256'), 'hex'),
   '76100000-0000-4000-8000-000000000001', now() + interval '7 days', 'multi_use');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.get_my_song_league_rejoin_request(repeat('r', 64))), 0,
  'departed member starts without a request');
select lives_ok($$ select * from public.request_song_league_rejoin(repeat('r', 64)) $$,
  'departed member can deliberately request rejoining');
select is((select status from public.get_my_song_league_rejoin_request(repeat('r', 64))), 'pending',
  'requester sees pending status');
select lives_ok($$ select * from public.request_song_league_rejoin(repeat('r', 64)) $$,
  'a concurrent-equivalent repeated request is idempotent');

reset role;
select is((select count(*)::integer from public.song_league_rejoin_requests where league_id =
  '76200000-0000-4000-8000-000000000001' and user_id = '76100000-0000-4000-8000-000000000002'), 1,
  'serialized repeated requests create exactly one row');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000004', true);
select throws_ok($$ select * from public.list_song_league_rejoin_requests(
  '76200000-0000-4000-8000-000000000001') $$, 'P0001',
  'Only the league owner can review rejoin requests.', 'outsiders cannot review requests');

select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.list_song_league_rejoin_requests(
  '76200000-0000-4000-8000-000000000001') where status = 'pending'), 1,
  'owner sees the pending request');
select lives_ok($$ select public.respond_song_league_rejoin_request(
  (select request_id from public.list_song_league_rejoin_requests('76200000-0000-4000-8000-000000000001') limit 1),
  'declined') $$, 'owner can decline');

select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000002', true);
select is((select status from public.get_my_song_league_rejoin_request(repeat('r', 64))), 'declined',
  'requester sees rejection');
select lives_ok($$ select * from public.request_song_league_rejoin(repeat('r', 64)) $$,
  'declined requester can retry');

select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.respond_song_league_rejoin_request(
  (select request_id from public.list_song_league_rejoin_requests('76200000-0000-4000-8000-000000000001') where status = 'pending' limit 1),
  'approved') $$, 'owner can approve when capacity is available');
select ok((select approval_expires_at > now() from public.list_song_league_rejoin_requests(
  '76200000-0000-4000-8000-000000000001') where status = 'approved'),
  'owner sees the short approval expiry');

select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.claim_song_league(repeat('r', 64)) $$,
  'approved member can retry the invitation and join');
select is((select status from public.get_my_song_league_rejoin_request(repeat('r', 64))), 'joined',
  'requester sees completed status');

reset role;
update public.song_league_members set left_at = now() where league_id = '76200000-0000-4000-8000-000000000001'
  and user_id = '76100000-0000-4000-8000-000000000002';
update public.song_league_rejoin_requests set status = 'pending', request_expires_at = now() - interval '1 minute',
  responded_at = null, approval_expires_at = null where league_id = '76200000-0000-4000-8000-000000000001'
  and user_id = '76100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000002', true);
select is((select status from public.get_my_song_league_rejoin_request(repeat('r', 64))), 'expired',
  'request expiry is visible');
select lives_ok($$ select * from public.request_song_league_rejoin(repeat('r', 64)) $$,
  'expired requester can retry');

reset role;
update public.song_leagues set max_members = 2 where id = '76200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.respond_song_league_rejoin_request(
  (select request_id from public.list_song_league_rejoin_requests('76200000-0000-4000-8000-000000000001') where status = 'pending' limit 1),
  'approved') $$, 'P0001', 'This Song League is full. Increase its capacity or remove a member first.',
  'full leagues cannot issue misleading approval');

reset role;
update public.song_leagues set max_members = 3 where id = '76200000-0000-4000-8000-000000000001';
update public.song_league_rejoin_requests set status = 'approved', approval_expires_at = now() - interval '1 minute'
  where league_id = '76200000-0000-4000-8000-000000000001' and user_id = '76100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76100000-0000-4000-8000-000000000002', true);
select is((select status from public.get_my_song_league_rejoin_request(repeat('r', 64))), 'expired',
  'approval expiry is visible');
select throws_ok($$ select public.claim_song_league(repeat('r', 64)) $$, 'P0001',
  'The league owner must approve this user before they can rejoin.', 'expired approval cannot be claimed');

select * from finish();
rollback;
