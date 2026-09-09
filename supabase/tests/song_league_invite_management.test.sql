begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id, email) values
  ('74100000-0000-4000-8000-000000000001', 'invite-owner@example.test'),
  ('74100000-0000-4000-8000-000000000002', 'invite-guest@example.test'),
  ('74100000-0000-4000-8000-000000000003', 'invite-outsider@example.test');
update public.users set backup_active = true
where id in ('74100000-0000-4000-8000-000000000001', '74100000-0000-4000-8000-000000000002');
insert into public.song_leagues(id, owner_user_id, name, max_members) values
  ('74200000-0000-4000-8000-000000000001', '74100000-0000-4000-8000-000000000001', 'Invite controls', 5);
insert into public.song_league_members(league_id, user_id, role) values
  ('74200000-0000-4000-8000-000000000001', '74100000-0000-4000-8000-000000000001', 'owner');
insert into public.song_league_invites(id, league_id, token_hash, created_by, expires_at, usage_policy) values
  ('74300000-0000-4000-8000-000000000001', '74200000-0000-4000-8000-000000000001',
    encode(extensions.digest(convert_to(repeat('a', 64), 'UTF8'), 'sha256'), 'hex'),
    '74100000-0000-4000-8000-000000000001', now() + interval '1 day', 'multi_use'),
  ('74300000-0000-4000-8000-000000000002', '74200000-0000-4000-8000-000000000001',
    encode(extensions.digest(convert_to(repeat('b', 64), 'UTF8'), 'sha256'), 'hex'),
    '74100000-0000-4000-8000-000000000001', now() + interval '1 day', 'multi_use');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.list_song_league_invites(
  '74200000-0000-4000-8000-000000000001')), 2, 'owner lists active invitations');
select ok((select not (to_jsonb(invite) ? 'token_hash') from public.list_song_league_invites(
  '74200000-0000-4000-8000-000000000001') invite limit 1), 'list results never expose token hashes');
select throws_ok($$ select * from public.song_league_invites $$, '42501', null,
  'owners cannot bypass the safe metadata RPC to read token hashes');

select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000003', true);
select throws_ok($$ select * from public.list_song_league_invites(
  '74200000-0000-4000-8000-000000000001') $$, 'P0001',
  'Only the league owner can list active invitations.', 'non-owners cannot enumerate invitations');

select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.revoke_song_league_invite('74300000-0000-4000-8000-000000000001') $$,
  'owner revokes one invitation');
select is((select count(*)::integer from public.list_song_league_invites(
  '74200000-0000-4000-8000-000000000001')), 1, 'revoked invitation disappears from the active list');

select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.claim_song_league(repeat('a', 64)) $$, 'P0001',
  'This Song League invitation is invalid, expired, exhausted, or revoked.',
  'a revoked link cannot be claimed');
select lives_ok($$ select public.claim_song_league(repeat('b', 64)) $$,
  'a separately created active link remains valid');

select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000001', true);
select is(public.revoke_all_song_league_invites('74200000-0000-4000-8000-000000000001'), 1,
  'owner revokes every remaining active invitation');
select is((select count(*)::integer from public.list_song_league_invites(
  '74200000-0000-4000-8000-000000000001')), 0, 'revoke all leaves no active links');

select set_config('request.jwt.claim.sub', '74100000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.claim_song_league(repeat('b', 64)) $$, 'P0001',
  'This Song League invitation is invalid, expired, exhausted, or revoked.',
  'a link revoked by revoke-all cannot be claimed');
select throws_ok($$ select public.revoke_all_song_league_invites(
  '74200000-0000-4000-8000-000000000001') $$, 'P0001',
  'Only the league owner can revoke invitations.', 'non-owners cannot revoke invitations');

select * from finish();
rollback;
