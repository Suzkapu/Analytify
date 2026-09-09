begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_column('public', 'song_leagues', 'creation_idempotency_hash',
  'league creation stores only a hash of the idempotency key');
select has_column('public', 'song_leagues', 'creation_request_hash',
  'league creation stores an immutable request fingerprint');
select has_function('public', 'create_song_league',
  array['text', 'text', 'integer', 'text', 'integer', 'text', 'integer', 'text'],
  'one RPC accepts every league and invitation creation field');

insert into auth.users(id, email) values
  ('74000000-0000-4000-8000-000000000001', 'atomic-league-owner@example.test');
update public.users set backup_active = true
where id = '74000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '74000000-0000-4000-8000-000000000001', true);

select throws_ok($$ select public.create_song_league(
  'Oversized token', 'Europe/Vienna', 5, repeat('x', 201), 168, 'multi_use', null,
  'oversized-token-key-000000000000001') $$, 'P0001', 'The invite token is invalid.',
  'invite-token hashing input is bounded');

select lives_ok($$ create temporary table first_creation as
  select public.create_song_league(
    'Atomic League', 'Europe/Vienna', 7, repeat('a', 64), 48, 'one_time', 1,
    'atomic-create-key-0000000000000001'
  ) as league_id $$, 'all creation inputs commit through one RPC');

reset role;
select is((select max_members from public.song_leagues where id = (select league_id from first_creation)),
  7, 'custom capacity is committed with the league');
select is((select count(*) from public.song_league_members
  where league_id = (select league_id from first_creation) and role = 'owner'),
  1::bigint, 'owner membership is committed with the league');
select ok((select expires_at between now() + interval '47 hours 59 minutes'
    and now() + interval '48 hours 1 minute'
    and token_hash = encode(extensions.digest(convert_to(repeat('a', 64), 'UTF8'), 'sha256'), 'hex')
    and usage_policy = 'one_time' and max_uses = 1
  from public.song_league_invites where league_id = (select league_id from first_creation)),
  'first invitation details are committed with the league');

set local role authenticated;
select is(public.create_song_league(
    'Atomic League', 'Europe/Vienna', 7, repeat('a', 64), 48, 'one_time', 1,
    'atomic-create-key-0000000000000001'
  ), (select league_id from first_creation), 'retry returns the original league');
reset role;
select is((select count(*) from public.song_leagues
  where creation_idempotency_hash = encode(extensions.digest(
    convert_to('atomic-create-key-0000000000000001', 'UTF8'), 'sha256'), 'hex')),
  1::bigint, 'retry does not duplicate the league');

set local role authenticated;
select throws_ok($$ select public.create_song_league(
    'Changed League', 'Europe/Vienna', 7, repeat('a', 64), 48, 'one_time', 1,
    'atomic-create-key-0000000000000001'
  ) $$, 'P0001', 'This Song League creation key was already used with different details.',
  'reusing a key with different input is rejected');
reset role;

create function public.test_fail_song_league_creation_stage()
returns trigger language plpgsql as $$
begin
  if current_setting('test.song_league_creation_stage', true) = tg_table_name then
    raise exception 'Injected creation failure at %', tg_table_name;
  end if;
  return new;
end;
$$;
create trigger test_fail_league_creation before insert on public.song_leagues
for each row execute function public.test_fail_song_league_creation_stage();
create trigger test_fail_member_creation before insert on public.song_league_members
for each row execute function public.test_fail_song_league_creation_stage();
create trigger test_fail_invite_creation before insert on public.song_league_invites
for each row execute function public.test_fail_song_league_creation_stage();

set local role authenticated;
select set_config('test.song_league_creation_stage', 'song_leagues', true);
select throws_ok($$ select public.create_song_league(
  'Fail league', 'Europe/Vienna', 5, repeat('b', 64), 168, 'multi_use', null,
  'fail-league-key-00000000000000001') $$, 'P0001', 'Injected creation failure at song_leagues',
  'league-stage failure is reported');
reset role;
select is((select count(*) from public.song_leagues where name = 'Fail league'), 0::bigint,
  'league-stage failure leaves no league');

set local role authenticated;
select set_config('test.song_league_creation_stage', 'song_league_members', true);
select throws_ok($$ select public.create_song_league(
  'Fail member', 'Europe/Vienna', 5, repeat('c', 64), 168, 'multi_use', null,
  'fail-member-key-00000000000000001') $$, 'P0001', 'Injected creation failure at song_league_members',
  'owner-membership-stage failure is reported');
reset role;
select is((select count(*) from public.song_leagues where name = 'Fail member'), 0::bigint,
  'owner-membership-stage failure rolls back the league');

set local role authenticated;
select set_config('test.song_league_creation_stage', 'song_league_invites', true);
select throws_ok($$ select public.create_song_league(
  'Fail invite', 'Europe/Vienna', 5, repeat('d', 64), 168, 'multi_use', null,
  'fail-invite-key-000000000000000001') $$, 'P0001', 'Injected creation failure at song_league_invites',
  'invitation-stage failure is reported');
reset role;
select is((select count(*) from public.song_leagues where name = 'Fail invite'), 0::bigint,
  'invitation-stage failure rolls back league and membership');

select * from finish();
rollback;
