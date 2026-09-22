create extension if not exists pgtap with schema extensions;
begin;
select plan(14);

select has_table('public', 'moderation_report_events', 'moderation decisions have an audit table');
select has_function('public', 'report_stats_user_v2', array['uuid', 'text', 'text', 'text'],
  'receipt-producing report RPC exists');
select has_function('public', 'appeal_moderation_report', array['uuid', 'text'],
  'affected users have an appeal RPC');
select has_function('public', 'admin_update_moderation_report', array['uuid', 'text', 'text', 'text', 'text', 'text'],
  'administrators have a decision RPC');

insert into auth.users(id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'moderation-reporter@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'moderation-affected@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'moderation-admin@example.test');
update public.users set spotify_id = 'moderation-reporter', display_name = 'Reporter'
  where id = 'a1000000-0000-4000-8000-000000000001';
update public.users set spotify_id = 'moderation-affected', display_name = 'Affected'
  where id = 'a1000000-0000-4000-8000-000000000002';
update public.users set spotify_id = 'moderation-admin', display_name = 'Reviewer'
  where id = 'a1000000-0000-4000-8000-000000000003';
insert into public.app_admins(user_id) values ('a1000000-0000-4000-8000-000000000003');
create temporary table moderation_test_case(report_id uuid, receipt_code text, status text);
grant all on table moderation_test_case to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into moderation_test_case
select * from public.report_stats_user_v2(
  'a1000000-0000-4000-8000-000000000002', 'Repeated unwanted messages', 'user_safety', null
);
select like((select receipt_code from moderation_test_case), 'AR-%', 'reporter receives a stable receipt');
select is((select status from moderation_test_case), 'submitted', 'new report enters the submitted queue');
select is((select count(*) from public.list_my_moderation_cases()), 1::bigint,
  'reporter can retrieve their receipt');
select throws_ok($$ select * from public.admin_list_moderation_reports(null) $$,
  'P0001', 'Administrator access is required.', 'ordinary user cannot read the admin inbox');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select lives_ok(format(
  'select public.admin_update_moderation_report(%L, %L, %L, %L, %L, %L)',
  (select report_id from moderation_test_case), 'resolved_action', 'warning',
  'The request violated the safety rules.', 'Your report was upheld.',
  'Your access was revoked. You may appeal this decision.'
), 'admin can record a reasoned decision');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select is((select notice from public.list_my_moderation_cases()),
  'Your access was revoked. You may appeal this decision.',
  'affected user receives only their appropriate notice');
select lives_ok(format(
  'select public.appeal_moderation_report(%L, %L)',
  (select report_id from moderation_test_case), 'The context was misunderstood.'
), 'affected user can appeal within the decision window');
reset role;
select is((select status from public.stats_user_reports where id = (select report_id from moderation_test_case)),
  'appealed', 'appeal returns the case to the moderation queue');
select is((select count(*) from public.moderation_report_events
  where report_id = (select report_id from moderation_test_case)), 3::bigint,
  'submission, decision, and appeal remain auditable');
select ok(not has_table_privilege('authenticated', 'public.moderation_report_events', 'SELECT'),
  'ordinary users cannot read the decision audit table');

select * from finish();
rollback;
