begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, email) values
  ('52000000-0000-4000-8000-000000000001', 'terms-user@example.test'),
  ('52000000-0000-4000-8000-000000000002', 'other-user@example.test');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.accept_current_terms(
  'analytify-eula-2026-09-22', '52000000-0000-4000-8000-000000000010', 'hosted'
) $$, 'the current EULA can be accepted');
select is((select count(*) from public.terms_acceptances where user_id = auth.uid()), 1::bigint,
  'acceptance is bound to the authenticated identity');
select ok((select accepted_at <= now() from public.terms_acceptances where user_id = auth.uid()),
  'the server records its own acceptance timestamp');
select lives_ok($$ select public.accept_current_terms(
  'analytify-eula-2026-09-22', '52000000-0000-4000-8000-000000000011', 'hosted'
) $$, 'retries are idempotent');
select is((select count(*) from public.terms_acceptances where user_id = auth.uid()), 1::bigint,
  'a retry cannot create duplicate evidence');
select throws_ok($$ select public.accept_current_terms(
  'obsolete-version', '52000000-0000-4000-8000-000000000012', 'hosted'
) $$, 'P0001', 'The current Terms version must be accepted.',
  'obsolete terms cannot be recorded as current');
select is((select count(*) from public.terms_acceptances where user_id = '52000000-0000-4000-8000-000000000002'), 0::bigint,
  'one user cannot create acceptance evidence for another identity');

select * from finish();
rollback;
