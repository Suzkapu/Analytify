create extension if not exists pgtap with schema extensions;
begin;
select plan(11);

insert into auth.users(id, email) values
  ('76300000-0000-4000-8000-000000000001', 'blocker@example.test'),
  ('76300000-0000-4000-8000-000000000002', 'blocked@example.test');
update public.users set spotify_id = 'blocker', display_name = 'Blocker', backup_active = true, stats_discoverable = true
where id = '76300000-0000-4000-8000-000000000001';
update public.users set spotify_id = 'blocked', display_name = 'Blocked person', backup_active = true, stats_discoverable = true
where id = '76300000-0000-4000-8000-000000000002';

select set_config('request.jwt.claim.sub', '76300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select public.request_stats_access('76300000-0000-4000-8000-000000000002') $$, 'access can be requested before blocking');
select lives_ok($$ select public.block_stats_user('76300000-0000-4000-8000-000000000002') $$, 'current user can block another stats user');
select is((select display_name from public.list_blocked_stats_users()), 'Blocked person', 'block list exposes minimal identity data');
select is((select status from public.stats_access_requests where owner_user_id = '76300000-0000-4000-8000-000000000002'), 'revoked', 'blocking revokes existing access and requests');
select lives_ok($$ select public.report_stats_user('76300000-0000-4000-8000-000000000002', 'Repeated unwanted requests') $$, 'reporting remains a separate moderation action');
select ok(not has_table_privilege('authenticated', 'public.stats_user_reports', 'DELETE'), 'ordinary users cannot delete reports');
select lives_ok($$ select public.unblock_stats_user('76300000-0000-4000-8000-000000000002') $$, 'current user can unblock their own block');
select is((select count(*) from public.list_blocked_stats_users()), 0::bigint, 'unblocked user leaves the block list');
select is((select status from public.stats_access_requests where owner_user_id = '76300000-0000-4000-8000-000000000002'), 'revoked', 'unblocking never restores previous access');
select is((select count(*) from public.search_stats_shareable_users('Blocked person')), 1::bigint, 'unblocking restores search eligibility');
select is((select count(*) from public.stats_user_reports where reported_user_id = '76300000-0000-4000-8000-000000000002'), 1::bigint, 'unblocking does not remove the report');

select * from finish();
rollback;
