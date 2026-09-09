begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id, email) values
  ('75100000-0000-4000-8000-000000000001', 'lifecycle-owner@example.test'),
  ('75100000-0000-4000-8000-000000000002', 'lifecycle-member@example.test'),
  ('75100000-0000-4000-8000-000000000003', 'lifecycle-next-owner@example.test'),
  ('75100000-0000-4000-8000-000000000004', 'lifecycle-outsider@example.test');
update public.users set backup_active = true, display_name = case id
  when '75100000-0000-4000-8000-000000000001' then 'Owner'
  when '75100000-0000-4000-8000-000000000002' then 'Member'
  when '75100000-0000-4000-8000-000000000003' then 'Next owner'
  else 'Outsider' end
where id::text like '75100000-%';
insert into public.song_leagues(id, owner_user_id, name, max_members) values
  ('75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000001', 'Lifecycle', 5);
insert into public.song_league_members(league_id, user_id, role, display_name) values
  ('75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000001', 'owner', 'Owner'),
  ('75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000002', 'member', 'Member'),
  ('75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000003', 'member', 'Next owner');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.remove_song_league_member(
  '75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000002') $$,
  'P0001', 'Only the owner of an active league can remove members.', 'outsiders cannot remove members');

select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000002', true);
select lives_ok($$ select public.leave_song_league('75200000-0000-4000-8000-000000000001') $$,
  'members can leave');
reset role;
select ok((select left_at is not null from public.song_league_members where league_id =
  '75200000-0000-4000-8000-000000000001' and user_id = '75100000-0000-4000-8000-000000000002'),
  'leaving retires active membership');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.list_song_league_lifecycle_events(
  '75200000-0000-4000-8000-000000000001') $$, 'P0001', 'The Song League was not found.',
  'departed members cannot read an active league');

select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.remove_song_league_member(
  '75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000001') $$,
  'P0001', 'The owner cannot remove themselves.', 'owners cannot remove themselves');
select lives_ok($$ select public.transfer_song_league_ownership(
  '75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000003') $$,
  'owners can transfer to an active member');
select is((select owner_user_id from public.song_leagues where id = '75200000-0000-4000-8000-000000000001'),
  '75100000-0000-4000-8000-000000000003'::uuid, 'league ownership changes atomically');
select is((select role from public.song_league_members where league_id = '75200000-0000-4000-8000-000000000001'
  and user_id = '75100000-0000-4000-8000-000000000001'), 'member', 'former owner becomes a member');
select lives_ok($$ select public.leave_song_league('75200000-0000-4000-8000-000000000001') $$,
  'former owner can leave after transfer');

select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.transfer_song_league_ownership(
  '75200000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000002') $$,
  'P0001', 'Choose an active member as the new owner.', 'ownership cannot transfer to a departed member');
select is((select count(*)::integer from public.list_song_league_lifecycle_events(
  '75200000-0000-4000-8000-000000000001')), 3, 'membership changes have an audit history');
select lives_ok($$ select public.close_song_league('75200000-0000-4000-8000-000000000001') $$,
  'owner can close without deleting history');
select ok((select closed_at is not null from public.song_leagues where id =
  '75200000-0000-4000-8000-000000000001'), 'close marks the league read-only');
select is((select count(*)::integer from public.list_song_league_lifecycle_events(
  '75200000-0000-4000-8000-000000000001')), 4, 'closure is audited and remains readable');

select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.song_leagues where id =
  '75200000-0000-4000-8000-000000000001'), 1, 'departed members can read closed league history');
select is((select count(*)::integer from public.list_song_league_lifecycle_events(
  '75200000-0000-4000-8000-000000000001')), 4, 'departed members can read the closed audit history');
select throws_ok($$ select public.leave_song_league('75200000-0000-4000-8000-000000000001') $$,
  'P0001', 'The active league was not found.', 'closed leagues reject membership mutations');

select set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.song_leagues where id =
  '75200000-0000-4000-8000-000000000001'), 0, 'outsiders cannot read closed league history');

select * from finish();
rollback;
