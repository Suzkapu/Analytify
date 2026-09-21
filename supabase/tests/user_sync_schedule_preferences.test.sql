begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users(id, email) values
  ('81000000-0000-4000-8000-000000000001', 'preference-user@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'preference-admin@example.test');
insert into public.app_admins(user_id) values ('81000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ select public.update_my_sync_schedule_preference('stats_short_term', true, 1, 'minutes') $$,
  'The selected interval is more frequent than the administrator allows.',
  'a user cannot request a faster interval than the admin limit'
);
select lives_ok(
  $$ select public.update_my_sync_schedule_preference('stats_short_term', true, 1, 'days') $$,
  'the exact administrator limit is accepted'
);
select ok((select optional_enabled and effective_active from public.get_my_sync_task_status()
  where task_key = 'stats_short_term'),
  'the personal choice persists for the verified profile');
select throws_ok(
  $$ select public.update_my_sync_schedule_preference('shared_playlists', false, 1, 'days') $$,
  'This automatic task is controlled by the feature that requires it.',
  'the user API cannot mutate shared-playlist work'
);
select throws_ok(
  $$ select public.update_my_sync_schedule_preference('song_league_playlists', false, 1, 'days') $$,
  'This automatic task is controlled by the feature that requires it.',
  'the user API cannot mutate league-playlist work'
);
select is((select count(*)::integer from public.get_my_sync_task_status() where editable), 4,
  'only personal data schedules are editable');
select is((select count(*)::integer from public.get_my_sync_task_status() where not editable), 2,
  'feature-owned playlist schedules remain read-only');

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select public.admin_update_sync_schedule_policy('stats_short_term', true, 2, 'days') $$,
  'an administrator can make a personal limit slower');
select ok((select short_term_interval_hours = 2880 and short_term_interval_unit = 'minutes'
  from public.admin_list_users() where user_id = '81000000-0000-4000-8000-000000000001'),
  'an existing faster choice is constrained immediately');
select lives_ok(
  $$ select public.admin_update_sync_schedule_policy('listening_history', false, 2, 'hours') $$,
  'an administrator can globally disable Listening History');
select throws_ok(
  $$ select public.admin_update_sync_schedule_policy('stats_medium_term', false, 7, 'days') $$,
  'Only Listening History can be disabled globally.',
  'other personal tasks retain a usable policy');

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$ select public.update_my_sync_schedule_preference('listening_history', true, 2, 'hours') $$,
  'This automatic task is disabled by the administrator.',
  'the global Listening History switch is enforced server-side');
select is((select policy_available from public.get_my_sync_task_status()
  where task_key = 'listening_history'), false,
  'the user status immediately exposes the global disable');
select is((select minimum_interval_minutes from public.get_my_sync_task_status()
  where task_key = 'listening_history'), 120,
  'the user status exposes the admin interval limit');

select * from finish();
rollback;
