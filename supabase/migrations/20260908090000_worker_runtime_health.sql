create table public.worker_runtime_health (
  component text primary key check (component = 'worker'),
  instance_id text not null,
  commit_sha text not null,
  ready boolean not null default false,
  started_at timestamptz not null,
  last_heartbeat_at timestamptz not null,
  stopped_at timestamptz,
  last_pass_started_at timestamptz,
  last_pass_succeeded_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.worker_runtime_health enable row level security;
revoke all on public.worker_runtime_health from public, anon, authenticated;
grant select, insert, update, delete on public.worker_runtime_health to service_role;

create or replace function public.record_worker_runtime_event(
  p_instance_id text, p_event text, p_error text default null, p_commit_sha text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := clock_timestamp();
  v_commit text := coalesce(nullif(trim(p_commit_sha), ''), 'development');
begin
  if coalesce(trim(p_instance_id), '') = '' then raise exception 'Worker instance ID is required.'; end if;
  if p_event not in ('startup', 'ready', 'heartbeat', 'pass_started', 'pass_succeeded', 'pass_failed', 'stopped') then
    raise exception 'Unknown worker runtime event.';
  end if;

  if p_event = 'startup' then
    insert into public.worker_runtime_health as runtime(
      component, instance_id, commit_sha, ready, started_at, last_heartbeat_at, stopped_at,
      last_pass_started_at, last_pass_succeeded_at, last_failure_at, last_error, updated_at
    ) values ('worker', p_instance_id, v_commit, false, v_now, v_now, null, null, null, null, null, v_now)
    on conflict (component) do update set
      instance_id = excluded.instance_id, commit_sha = excluded.commit_sha, ready = false,
      started_at = excluded.started_at, last_heartbeat_at = excluded.last_heartbeat_at,
      stopped_at = null, last_pass_started_at = null, last_pass_succeeded_at = null,
      last_failure_at = null, last_error = null, updated_at = excluded.updated_at;
    return true;
  end if;

  update public.worker_runtime_health set
    last_heartbeat_at = v_now,
    ready = case when p_event = 'ready' then true when p_event = 'stopped' then false else ready end,
    stopped_at = case when p_event = 'stopped' then v_now else stopped_at end,
    last_pass_started_at = case when p_event = 'pass_started' then v_now else last_pass_started_at end,
    last_pass_succeeded_at = case when p_event = 'pass_succeeded' then v_now else last_pass_succeeded_at end,
    last_failure_at = case when p_event = 'pass_failed' then v_now else last_failure_at end,
    last_error = case when p_event in ('ready', 'pass_succeeded') then null when p_event = 'pass_failed' then left(coalesce(p_error, 'Unknown worker failure'), 2000) else last_error end,
    commit_sha = v_commit,
    updated_at = v_now
  where component = 'worker' and instance_id = p_instance_id;
  return found;
end; $$;

revoke all on function public.record_worker_runtime_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_worker_runtime_event(text, text, text, text) to service_role;

create or replace function public.admin_operational_health()
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare v_result jsonb;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  select jsonb_build_object(
    'syncQueueDepth', (select count(*) from public.sync_job_runs where status = 'queued'),
    'oldestSyncQueueAgeSeconds', coalesce((select extract(epoch from (now() - min(requested_at)))::integer from public.sync_job_runs where status = 'queued'), 0),
    'notificationQueueDepth', (select count(*) from (
      select id from public.song_league_push_deliveries where status in ('queued', 'retry')
      union all select id from public.song_league_song_push_deliveries where status in ('queued', 'retry')
      union all select id from public.stats_access_push_deliveries where status in ('queued', 'retry')
    ) queued_push),
    'oldestNotificationQueueAgeSeconds', coalesce((select extract(epoch from (now() - min(created_at)))::integer from (
      select created_at from public.song_league_push_deliveries where status in ('queued', 'retry')
      union all select created_at from public.song_league_song_push_deliveries where status in ('queued', 'retry')
      union all select created_at from public.stats_access_push_deliveries where status in ('queued', 'retry')
    ) queued_push), 0),
    'expiredLeases', (select count(*) from public.sync_job_runs where status = 'running' and lease_expires_at < now()),
    'lastSuccessByFeature', coalesce((select jsonb_object_agg(task_key, last_success_at) from (
      select task_key, max(last_success_at) last_success_at from public.sync_task_state group by task_key
    ) latest), '{}'::jsonb),
    'releases', coalesce((select jsonb_object_agg(component, commit_sha) from public.deployment_revisions), '{}'::jsonb),
    'workerRuntime', coalesce((select jsonb_build_object(
      'state', case when stopped_at is not null then 'stopped' when last_heartbeat_at < now() - interval '2 minutes' then 'stale' when ready then 'healthy' else 'starting' end,
      'startedAt', started_at, 'lastHeartbeatAt', last_heartbeat_at,
      'secondsSinceHeartbeat', greatest(0, extract(epoch from (now() - last_heartbeat_at))::integer),
      'lastPassStartedAt', last_pass_started_at, 'lastPassSucceededAt', last_pass_succeeded_at,
      'lastFailureAt', last_failure_at, 'lastError', last_error, 'commitSha', commit_sha
    ) from public.worker_runtime_health where component = 'worker'), jsonb_build_object(
      'state', 'never_observed', 'startedAt', null, 'lastHeartbeatAt', null, 'secondsSinceHeartbeat', null,
      'lastPassStartedAt', null, 'lastPassSucceededAt', null, 'lastFailureAt', null, 'lastError', null, 'commitSha', null
    )),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('key', alert_key, 'severity', severity,
      'message', message, 'firstSeenAt', first_seen_at, 'lastSeenAt', last_seen_at) order by last_seen_at desc)
      from public.operational_alerts where resolved_at is null), '[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

revoke all on function public.admin_operational_health() from public, anon;
grant execute on function public.admin_operational_health() to authenticated;
