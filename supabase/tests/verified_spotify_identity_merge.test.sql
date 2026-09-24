begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id, email, is_anonymous) values
  ('51000000-0000-4000-8000-000000000001', 'hosted-merge@example.test', false),
  ('52000000-0000-4000-8000-000000000002', null, true),
  ('53000000-0000-4000-8000-000000000003', 'collision@example.test', false),
  ('54000000-0000-4000-8000-000000000004', null, true),
  ('55000000-0000-4000-8000-000000000005', null, true),
  ('56000000-0000-4000-8000-000000000006', 'hosted-target@example.test', false);

update public.users set spotify_id = 'hosted-verified', verified_spotify_id = 'verified-account',
  display_name = 'Strong name', profile_pic_url = 'https://i.scdn.co/image/strong', backup_active = true
where id = '51000000-0000-4000-8000-000000000001';
update public.users set spotify_id = 'personal:52000000-0000-4000-8000-000000000002'
where id = '52000000-0000-4000-8000-000000000002';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select * from public.merge_verified_spotify_profile(
  '52000000-0000-4000-8000-000000000002', 'verified-account') $$,
  'a personal login can absorb the independently verified hosted profile');
reset role;

select is((select count(*) from public.users where verified_spotify_id = 'verified-account'), 1::bigint,
  'only one canonical profile remains');
select is((select display_name from public.users where id = '52000000-0000-4000-8000-000000000002'),
  'Strong name', 'the stronger display name is retained');
select ok((select backup_active from public.users where id = '52000000-0000-4000-8000-000000000002'),
  'cloud backup state is retained');
select is((select count(*) from public.spotify_identity_merge_audit
  where source_user_id = '51000000-0000-4000-8000-000000000001'
    and target_user_id = '52000000-0000-4000-8000-000000000002'), 1::bigint,
  'the merge leaves audit evidence');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.merge_verified_spotify_profile(
  '52000000-0000-4000-8000-000000000002', 'spoofed-account') $$,
  '42501', null, 'browser roles cannot invoke the trusted merge');
reset role;

update public.users set spotify_id = 'collision-hosted', verified_spotify_id = 'collision-account'
where id = '53000000-0000-4000-8000-000000000003';
update public.users set spotify_id = 'personal:54000000-0000-4000-8000-000000000004',
  verified_spotify_id = 'collision-account'
where id = '54000000-0000-4000-8000-000000000004';
create table public.identity_merge_collision_fixture (
  user_id uuid not null references public.users(id) on delete cascade,
  slot integer not null,
  primary key(user_id, slot)
);
-- Reassigning the source row to the target exposes an ambiguous composite-key
-- collision and must roll the entire transaction back.
insert into public.identity_merge_collision_fixture(user_id, slot) values
  ('53000000-0000-4000-8000-000000000003', 1),
  ('54000000-0000-4000-8000-000000000004', 1);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok($$ select * from public.merge_verified_spotify_profile(
  '54000000-0000-4000-8000-000000000004', 'collision-account') $$,
  '23505', null, 'ambiguous unique collisions abort rather than guessing');
reset role;

select is((select count(*) from public.users where verified_spotify_id = 'collision-account'), 2::bigint,
  'a failed merge rolls back both profiles');
select is((select count(*) from public.identity_merge_collision_fixture where user_id in (
  '53000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000004'
)), 2::bigint, 'a failed merge rolls back dependent rows');
select is((select count(*) from public.spotify_identity_merge_audit
  where verified_spotify_id = 'collision-account'), 0::bigint,
  'a failed merge cannot leave misleading success evidence');

-- The direction is intentionally determined by the current authenticated
-- profile, not by whether hosted OAuth or personal PKCE was used first.
update public.users set spotify_id = 'personal:55000000-0000-4000-8000-000000000005',
  verified_spotify_id = 'reverse-account', display_name = 'Personal profile'
where id = '55000000-0000-4000-8000-000000000005';
update public.users set spotify_id = 'pending:56000000-0000-4000-8000-000000000006'
where id = '56000000-0000-4000-8000-000000000006';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select * from public.merge_verified_spotify_profile(
  '56000000-0000-4000-8000-000000000006', 'reverse-account') $$,
  'a hosted login can absorb the independently verified personal profile');
select is((select count(*) from public.users where verified_spotify_id = 'reverse-account'), 1::bigint,
  'the reverse direction also leaves one canonical profile');
select is((select display_name from public.users where id = '56000000-0000-4000-8000-000000000006'),
  'Personal profile', 'the reverse merge preserves the established profile name');
select is((select merged from public.merge_verified_spotify_profile(
  '56000000-0000-4000-8000-000000000006', 'reverse-account')), false,
  'a repeated callback is idempotent after the advisory-locked merge');
select throws_ok($$ select * from public.merge_verified_spotify_profile(
  '56000000-0000-4000-8000-000000000006', 'client-spoofed-account') $$,
  '23514', null, 'a client-supplied identity cannot replace a verified identity');
reset role;

select is((select count(*) from public.spotify_identity_merge_audit
  where verified_spotify_id = 'reverse-account'), 1::bigint,
  'an idempotent callback does not duplicate audit evidence');
select is((select count(*) from public.users where id = '55000000-0000-4000-8000-000000000005'), 0::bigint,
  'the absorbed personal profile is removed only after its data is reassigned');

select * from finish();
rollback;
