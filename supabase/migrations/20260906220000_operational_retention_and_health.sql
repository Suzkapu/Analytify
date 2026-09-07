-- Bounded operational history, deduplicated alerts, and a private admin health view.
alter table public.deployment_revisions drop constraint if exists deployment_revisions_component_check;
alter table public.deployment_revisions add constraint deployment_revisions_component_check check (
  component in ('supabase', 'worker', 'edge:spotify-credentials',
    'edge:song-league-playlist-sync', 'edge:song-league-notifications')
);

create table if not exists public.operational_alerts (
  alert_key text primary key,
  severity text not null check (severity in ('warning', 'critical')),
  message text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  resolved_at timestamptz
);
alter table public.operational_alerts enable row level security;
revoke all on public.operational_alerts from public, anon, authenticated;
grant all on public.operational_alerts to service_role;
grant select, insert, update on public.deployment_revisions to service_role;

create or replace function private.cleanup_operational_history()
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare v_runs integer := 0; v_deliveries integer := 0; v_redacted integer := 0;
  v_delivery_errors_redacted integer := 0; v_count integer := 0;
begin
  update public.sync_job_runs set error = null, details = '{}'::jsonb
  where status = 'failed' and finished_at < now() - interval '30 days'
    and (error is not null or details <> '{}'::jsonb);
  get diagnostics v_redacted = row_count;

  delete from public.sync_job_runs
  where (status in ('succeeded', 'cancelled') and finished_at < now() - interval '30 days')
     or (status = 'failed' and finished_at < now() - interval '90 days');
  get diagnostics v_runs = row_count;

  update public.song_league_push_deliveries set last_error = null
  where status = 'failed' and updated_at < now() - interval '30 days' and last_error is not null;
  get diagnostics v_delivery_errors_redacted = row_count;
  update public.song_league_song_push_deliveries set last_error = null
  where status = 'failed' and updated_at < now() - interval '30 days' and last_error is not null;
  get diagnostics v_count = row_count;
  v_delivery_errors_redacted := v_delivery_errors_redacted + v_count;
  update public.stats_access_push_deliveries set last_error = null
  where status = 'failed' and updated_at < now() - interval '30 days' and last_error is not null;
  get diagnostics v_count = row_count;
  v_delivery_errors_redacted := v_delivery_errors_redacted + v_count;

  delete from public.song_league_push_deliveries
  where (status = 'sent' and coalesce(sent_at, updated_at) < now() - interval '30 days')
     or (status = 'failed' and updated_at < now() - interval '90 days');
  get diagnostics v_deliveries = row_count;
  delete from public.song_league_song_push_deliveries
  where (status = 'sent' and coalesce(sent_at, updated_at) < now() - interval '30 days')
     or (status = 'failed' and updated_at < now() - interval '90 days');
  get diagnostics v_count = row_count;
  v_deliveries := v_deliveries + v_count;
  delete from public.stats_access_push_deliveries
  where (status = 'sent' and coalesce(sent_at, updated_at) < now() - interval '30 days')
     or (status = 'failed' and updated_at < now() - interval '90 days');
  get diagnostics v_count = row_count;
  v_deliveries := v_deliveries + v_count;

  delete from public.spotify_credential_rotation_audit
  where completed_at < now() - interval '90 days';
  return jsonb_build_object('runs_deleted', v_runs, 'runs_redacted', v_redacted,
    'deliveries_deleted', v_deliveries, 'delivery_errors_redacted', v_delivery_errors_redacted);
end; $$;

create or replace function public.monitor_operational_health()
returns table(alert_key text, severity text, message text)
language plpgsql security definer set search_path = public, private as $$
declare
  v_queue_depth integer;
  v_oldest_seconds integer;
  v_push_queue_depth integer;
  v_oldest_push_seconds integer;
  v_expired_leases integer;
  v_provider_attempts integer;
  v_provider_failures integer;
  v_rate numeric;
  v_now timestamptz := now();
  v_findings jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Operational monitoring is restricted to the trusted worker.'; end if;
  select count(*), coalesce(extract(epoch from (v_now - min(requested_at)))::integer, 0)
    into v_queue_depth, v_oldest_seconds from public.sync_job_runs where status = 'queued';
  select count(*) into v_expired_leases from public.sync_job_runs
    where status = 'running' and lease_expires_at < v_now;
  select count(*), coalesce(extract(epoch from (v_now - min(created_at)))::integer, 0)
    into v_push_queue_depth, v_oldest_push_seconds
  from (
    select created_at from public.song_league_push_deliveries where status in ('queued', 'retry')
    union all select created_at from public.song_league_song_push_deliveries where status in ('queued', 'retry')
    union all select created_at from public.stats_access_push_deliveries where status in ('queued', 'retry')
  ) queued_push;
  select count(*), count(*) filter (where status = 'failed') into v_provider_attempts, v_provider_failures
  from (
    select status, updated_at from public.song_league_push_deliveries
    union all select status, updated_at from public.song_league_song_push_deliveries
    union all select status, updated_at from public.stats_access_push_deliveries
  ) delivery where updated_at >= v_now - interval '1 hour' and status in ('sent', 'failed');
  v_rate := case when v_provider_attempts = 0 then 0 else v_provider_failures::numeric / v_provider_attempts end;

  if v_queue_depth >= 50 or v_oldest_seconds >= 900 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'alert_key', 'sync-backlog', 'severity', case when v_oldest_seconds >= 3600 then 'critical' else 'warning' end,
      'message', format('%s sync jobs queued; oldest has waited %s seconds.', v_queue_depth, v_oldest_seconds)));
  end if;
  if v_expired_leases > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'alert_key', 'expired-sync-leases', 'severity', 'critical',
      'message', format('%s sync job leases have expired.', v_expired_leases)));
  end if;
  if v_push_queue_depth >= 100 or v_oldest_push_seconds >= 900 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'alert_key', 'push-backlog', 'severity', case when v_oldest_push_seconds >= 3600 then 'critical' else 'warning' end,
      'message', format('%s push deliveries queued; oldest has waited %s seconds.', v_push_queue_depth, v_oldest_push_seconds)));
  end if;
  if v_provider_attempts >= 10 and v_rate >= 0.20 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'alert_key', 'push-provider-errors', 'severity', case when v_rate >= 0.50 then 'critical' else 'warning' end,
      'message', format('Push provider error rate is %s%% across %s recent deliveries.', round(v_rate * 100), v_provider_attempts)));
  end if;

  update public.operational_alerts existing set resolved_at = v_now
  where resolved_at is null and not exists (
    select 1 from jsonb_to_recordset(v_findings) as finding(alert_key text, severity text, message text)
    where finding.alert_key = existing.alert_key
  );
  insert into public.operational_alerts as existing(alert_key, severity, message, first_seen_at, last_seen_at, resolved_at)
  select finding.alert_key, finding.severity, finding.message, v_now, v_now, null
  from jsonb_to_recordset(v_findings) as finding(alert_key text, severity text, message text)
  on conflict on constraint operational_alerts_pkey do update
    set severity = excluded.severity, message = excluded.message,
    last_seen_at = v_now, resolved_at = null;

  return query
  update public.operational_alerts existing set last_notified_at = v_now
  where existing.resolved_at is null
    and (existing.last_notified_at is null or existing.last_notified_at < v_now - interval '30 minutes')
  returning existing.alert_key, existing.severity, existing.message;
end; $$;

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
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('key', alert_key, 'severity', severity,
      'message', message, 'firstSeenAt', first_seen_at, 'lastSeenAt', last_seen_at) order by last_seen_at desc)
      from public.operational_alerts where resolved_at is null), '[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

revoke all on function private.cleanup_operational_history() from public;
revoke all on function public.monitor_operational_health() from public, anon, authenticated;
revoke all on function public.admin_operational_health() from public, anon;
grant execute on function private.cleanup_operational_history() to service_role;
grant execute on function public.monitor_operational_health() to service_role;
grant execute on function public.admin_operational_health() to authenticated;

select cron.schedule('analytify-operational-retention', '17 3 * * *',
  $cron$select private.cleanup_operational_history();$cron$)
where not exists (select 1 from cron.job where jobname = 'analytify-operational-retention');
