begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is((select relrowsecurity from pg_class where oid = 'public.deployment_revisions'::regclass), true,
  'deployment revisions use RLS');
insert into public.deployment_revisions(component, commit_sha)
values ('supabase', repeat('a', 40));
set local role anon;
select is((select commit_sha from public.deployment_revisions where component = 'supabase'), repeat('a', 40),
  'anonymous live checks can read the non-secret release revision');
select throws_ok($$ update public.deployment_revisions set commit_sha = repeat('b', 40) $$,
  '42501', 'permission denied for table deployment_revisions',
  'anonymous clients cannot rewrite the deployment revision');
select throws_ok($$ insert into public.deployment_revisions(component, commit_sha)
  values ('supabase', 'not-a-commit') $$,
  '42501', 'permission denied for table deployment_revisions',
  'anonymous clients cannot insert fake revisions');

select * from finish();
rollback;
