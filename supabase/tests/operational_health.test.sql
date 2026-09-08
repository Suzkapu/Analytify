begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id, email) values
  ('68000000-0000-4000-8000-000000000001', 'operations-admin@example.test'),
  ('68000000-0000-4000-8000-000000000002', 'operations-user@example.test');
insert into public.app_admins(user_id) values ('68000000-0000-4000-8000-000000000001');

insert into public.sync_job_runs(user_id, task_key, status, requested_at, finished_at, error, details) values
  ('68000000-0000-4000-8000-000000000002', 'listening_history', 'queued', now() - interval '20 minutes', null, null, '{}'),
  ('68000000-0000-4000-8000-000000000002', 'stats_short_term', 'succeeded', now() - interval '32 days', now() - interval '31 days', null, '{}'),
  ('68000000-0000-4000-8000-000000000002', 'stats_medium_term', 'failed', now() - interval '32 days', now() - interval '31 days', 'sensitive provider error', '{"provider":"spotify"}'),
  ('68000000-0000-4000-8000-000000000002', 'stats_long_term', 'failed', now() - interval '92 days', now() - interval '91 days', 'expired provider error', '{}');

insert into public.deployment_revisions(component, commit_sha) values
  ('supabase', repeat('a', 40)), ('worker', repeat('a', 40)),
  ('edge:spotify-credentials', repeat('a', 40)),
  ('edge:song-league-playlist-sync', repeat('a', 40)),
  ('edge:song-league-notifications', repeat('a', 40));

select ok(not has_function_privilege('authenticated', 'public.monitor_operational_health()', 'EXECUTE'),
  'authenticated clients cannot run the health monitor');
select ok(has_function_privilege('service_role', 'public.monitor_operational_health()', 'EXECUTE'),
  'the trusted worker can run the health monitor');
select ok(has_function_privilege('service_role', 'private.cleanup_operational_history()', 'EXECUTE'),
  'the service role can invoke retention explicitly');
select ok(has_table_privilege('service_role', 'public.deployment_revisions', 'INSERT')
    and has_table_privilege('service_role', 'public.deployment_revisions', 'UPDATE'),
  'the worker can publish its release identity');
select ok(not has_function_privilege('authenticated', 'public.record_worker_runtime_event(text, text, text, text)', 'EXECUTE'),
  'authenticated clients cannot forge worker liveness');
select ok(has_function_privilege('service_role', 'public.record_worker_runtime_event(text, text, text, text)', 'EXECUTE'),
  'the service role can persist worker liveness');

set local role service_role;
select ok(public.record_worker_runtime_event('worker-test', 'startup', null, repeat('a', 40)),
  'worker startup is persisted');
select ok(public.record_worker_runtime_event('worker-test', 'ready', null, repeat('a', 40)),
  'worker readiness is persisted');
select lives_ok($$ create temporary table monitor_result as select * from public.monitor_operational_health() $$,
  'the worker can evaluate operational health');
select is((select count(*) from monitor_result where alert_key = 'sync-backlog'), 1::bigint,
  'an old queued job raises a backlog alert');
select is((select count(*) from public.monitor_operational_health()), 0::bigint,
  'the alert cooldown suppresses notification storms');
select lives_ok($$ select private.cleanup_operational_history() $$,
  'the retention policy runs as the service role');
select is((select count(*) from public.sync_job_runs where task_key = 'stats_short_term'), 0::bigint,
  'completed runs older than 30 days are removed');
select is((select count(*) from public.sync_job_runs where task_key = 'stats_long_term'), 0::bigint,
  'failed runs older than 90 days are removed');
select ok((select error is null and details = '{}'::jsonb from public.sync_job_runs where task_key = 'stats_medium_term'),
  'older failed runs are retained without sensitive diagnostics');

delete from public.sync_job_runs where status = 'queued';
select public.monitor_operational_health();
select ok((select resolved_at is not null from public.operational_alerts where alert_key = 'sync-backlog'),
  'recovered conditions resolve their active alert');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000001', true);
select is((public.admin_operational_health() -> 'releases' ->> 'worker'), repeat('a', 40),
  'admins can inspect the worker release identity');
select is((public.admin_operational_health() -> 'workerRuntime' ->> 'state'), 'healthy',
  'a fresh ready heartbeat is healthy even when queues are empty');
select is((public.admin_operational_health() -> 'workerRuntime' ->> 'lastHeartbeatAt') is not null, true,
  'admins can inspect the persisted worker heartbeat');
set local role service_role;
update public.worker_runtime_health set last_heartbeat_at = now() - interval '10 minutes', ready = true
where component = 'worker';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000001', true);
select is((public.admin_operational_health() -> 'workerRuntime' ->> 'state'), 'stale',
  'a missing worker heartbeat is reported as stale');
set local role service_role;
delete from public.worker_runtime_health where component = 'worker';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000001', true);
select is((public.admin_operational_health() -> 'workerRuntime' ->> 'state'), 'never_observed',
  'an absent runtime row is distinguished from healthy zero metrics');
select set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.admin_operational_health() $$, 'P0001', 'Administrator access is required.',
  'non-admin users cannot inspect operational health');

select * from finish();
rollback;
