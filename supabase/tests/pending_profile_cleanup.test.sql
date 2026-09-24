begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, email) values
  ('57000000-0000-4000-8000-000000000007', 'cleanup-admin@example.test'),
  ('58000000-0000-4000-8000-000000000008', 'old-pending@example.test'),
  ('59000000-0000-4000-8000-000000000009', 'recent-pending@example.test');
insert into public.app_admins(user_id) values ('57000000-0000-4000-8000-000000000007');
update public.users set spotify_id = 'pending:58000000-0000-4000-8000-000000000008',
  created_at = now() - interval '1 hour'
where id = '58000000-0000-4000-8000-000000000008';
update public.users set spotify_id = 'pending:59000000-0000-4000-8000-000000000009'
where id = '59000000-0000-4000-8000-000000000009';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000008', true);
select throws_ok($$ select public.admin_review_pending_spotify_profile(
  '58000000-0000-4000-8000-000000000008') $$, '42501', null,
  'ordinary users cannot inspect pending registrations');

select set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-000000000007', true);
select ok((select (public.admin_review_pending_spotify_profile(
  '58000000-0000-4000-8000-000000000008')->>'eligible')::boolean),
  'an old pending registration with only its default settings passes review');
select ok(not (select (public.admin_review_pending_spotify_profile(
  '59000000-0000-4000-8000-000000000009')->>'eligible')::boolean),
  'a recent registration is kept because sign-in may still be running');
select throws_ok($$ select public.admin_delete_reviewed_pending_spotify_profile(
  '58000000-0000-4000-8000-000000000008', 'pending:wrong') $$,
  '40001', null, 'cleanup aborts if the reviewed identity changed');
select lives_ok($$ select public.admin_delete_reviewed_pending_spotify_profile(
  '58000000-0000-4000-8000-000000000008',
  'pending:58000000-0000-4000-8000-000000000008') $$,
  'an administrator can delete the exact registration after a clean review');
reset role;

select is((select count(*) from auth.users where id = '58000000-0000-4000-8000-000000000008'),
  0::bigint, 'cleanup removes the incomplete authentication identity');
select is((select count(*) from public.pending_profile_cleanup_audit
  where deleted_user_id = '58000000-0000-4000-8000-000000000008'), 1::bigint,
  'reviewed cleanup leaves limited audit evidence');

select * from finish();
rollback;
