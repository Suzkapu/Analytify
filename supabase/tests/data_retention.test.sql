create extension if not exists pgtap with schema extensions;
begin;
select plan(20);

select has_table('public', 'retention_cleanup_runs', 'retention execution history is reconstructible');
select has_function('private', 'cleanup_data_retention', array['timestamp with time zone'],
  'bounded cleanup function is present');
select has_function('private', 'run_data_retention_cleanup', array['timestamp with time zone'],
  'monitored cleanup wrapper is present');
select has_function('public', 'monitor_data_retention_health', array[]::text[],
  'retention health monitor is present');

insert into auth.users(id, email, created_at) values
  ('99000000-0000-4000-8000-000000000001', 'retention-one@example.test', '2023-01-01'),
  ('99000000-0000-4000-8000-000000000002', 'retention-two@example.test', '2023-01-01'),
  ('99000000-0000-4000-8000-000000000003', 'retention-three@example.test', '2023-01-01');
update public.users set spotify_id = 'retention-one', created_at = '2023-01-01', last_synced_at = null
where id = '99000000-0000-4000-8000-000000000001';
update public.users set spotify_id = 'retention-two', created_at = '2023-01-01'
where id = '99000000-0000-4000-8000-000000000002';
update public.users set spotify_id = 'retention-three', created_at = '2023-01-01'
where id = '99000000-0000-4000-8000-000000000003';

insert into public.artists(id, name, last_updated) values
  ('retention-orphan-artist', 'Orphan artist', '2025-01-01');
insert into public.albums(id, name, last_updated) values
  ('retention-orphan-album', 'Orphan album', '2025-01-01');
insert into public.album_artists(album_id, artist_id) values
  ('retention-orphan-album', 'retention-orphan-artist');
insert into public.tracks(id, name, album_id, last_updated) values
  ('retention-orphan-track', 'Orphan track', 'retention-orphan-album', '2025-01-01'),
  ('retention-kept-track', 'Referenced track', null, '2025-01-01');
insert into public.listening_history(user_id, track_id, played_at) values
  ('99000000-0000-4000-8000-000000000001', 'retention-kept-track', '2025-01-02');

insert into public.stats_access_requests(
  owner_user_id, viewer_user_id, owner_display_name, viewer_display_name,
  status, requested_at, updated_at
) values
  ('99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000002',
    'One', 'Two', 'pending', '2025-01-01', '2025-01-01'),
  ('99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000003',
    'One', 'Three', 'approved', '2025-01-01', '2025-01-01');
insert into public.stats_user_reports(
  reporter_user_id, reported_user_id, reason, created_at, reviewed_at
) values
  ('99000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000002',
    'Reviewed retention report', '2025-01-01', '2025-01-02'),
  ('99000000-0000-4000-8000-000000000003', '99000000-0000-4000-8000-000000000002',
    'Pending retention report', '2025-01-01', null);

create temporary table retention_test_result(summary jsonb);
insert into retention_test_result select private.cleanup_data_retention('2026-09-22T12:00:00Z');

select is((select (summary->>'stats_access_requests_deleted')::integer from retention_test_result), 1,
  'cleanup reports its expired access deletion');
select is((select count(*) from public.stats_access_requests where status = 'pending'), 0::bigint,
  'expired pending Stats requests are deleted');
select is((select count(*) from public.stats_access_requests where status = 'approved'), 1::bigint,
  'approved Stats access is never age-deleted');
select is((select count(*) from public.stats_user_reports where reviewed_at is not null), 0::bigint,
  'old reviewed reports are deleted');
select is((select count(*) from public.stats_user_reports where reviewed_at is null), 1::bigint,
  'pending reports remain available for review');
select is((select count(*) from public.tracks where id = 'retention-orphan-track'), 0::bigint,
  'old unreferenced tracks are deleted');
select is((select count(*) from public.tracks where id = 'retention-kept-track'), 1::bigint,
  'tracks referenced by listening history are preserved');
select is((select count(*) from public.albums where id = 'retention-orphan-album'), 0::bigint,
  'albums left unreferenced by catalog cleanup are deleted');
select is((select count(*) from public.artists where id = 'retention-orphan-artist'), 0::bigint,
  'artists left unreferenced by catalog cleanup are deleted');
select is((select count(*) from public.users where id = '99000000-0000-4000-8000-000000000001'), 1::bigint,
  'inactive profiles are review-only and never auto-deleted');

select ok(not has_function_privilege(
  'authenticated', 'private.cleanup_data_retention(timestamp with time zone)', 'EXECUTE'
), 'ordinary users cannot execute retention cleanup');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select private.run_data_retention_cleanup(now()) $$,
  'trusted worker can run monitored cleanup');
select is((select count(*) from public.retention_cleanup_runs where status = 'succeeded' and finished_at is not null),
  2::bigint, 'migration baseline and explicit cleanup are recorded as successful');
select is((select count(*) from public.monitor_data_retention_health()), 0::bigint,
  'fresh successful cleanup produces no alert');

insert into public.retention_cleanup_runs(started_at, finished_at, status, error)
values (now() + interval '1 minute', now() + interval '1 minute', 'failed', 'test failure');
select is((select count(*) from public.monitor_data_retention_health()), 1::bigint,
  'a failed latest cleanup emits one due critical alert');
select is((select severity from public.operational_alerts where alert_key = 'data-retention-cleanup'),
  'critical', 'failed retention cleanup remains visible in operational health');

select * from finish();
rollback;
