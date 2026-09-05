alter table public.sync_job_runs
  add column if not exists worker_id uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

create index if not exists sync_job_runs_expired_lease_idx
  on public.sync_job_runs(lease_expires_at)
  where status = 'running';

create or replace function public.claim_sync_jobs(
  p_worker_id uuid,
  p_limit integer default 10,
  p_lease_seconds integer default 120
) returns setof public.sync_job_runs
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role access is required.';
  end if;
  if p_worker_id is null then raise exception 'A worker ID is required.'; end if;

  update public.sync_job_runs
  set status = 'queued',
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null,
      started_at = null,
      error = 'Recovered after the previous worker lease expired.',
      details = jsonb_set(details, '{lease_recovered}', 'true'::jsonb, true)
  where status = 'running'
    and (lease_expires_at is null or lease_expires_at <= now());

  return query
  with candidates as (
    select run.id
    from public.sync_job_runs run
    where run.status = 'queued'
    order by run.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.sync_job_runs run
  set status = 'running',
      worker_id = p_worker_id,
      started_at = now(),
      heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
      attempt_count = run.attempt_count + 1,
      error = null
  from candidates
  where run.id = candidates.id
  returning run.*;
end;
$$;

create or replace function public.heartbeat_sync_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 120
) returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role access is required.';
  end if;
  update public.sync_job_runs
  set heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)))
  where id = p_job_id and status = 'running' and worker_id = p_worker_id;
  return found;
end;
$$;

create or replace function public.complete_sync_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_status text,
  p_last_started_at timestamptz,
  p_last_success_at timestamptz,
  p_next_run_at timestamptz,
  p_last_error text,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.sync_job_runs%rowtype;
  v_finished_at timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role access is required.';
  end if;
  if p_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'The terminal job status is invalid.';
  end if;

  select * into v_job
  from public.sync_job_runs
  where id = p_job_id and status = 'running' and worker_id = p_worker_id
  for update;
  if not found then
    raise exception 'The sync job lease is no longer owned by this worker.';
  end if;

  if p_status <> 'cancelled' then
    insert into public.sync_task_state(
      user_id, task_key, last_started_at, last_success_at,
      next_run_at, last_error, updated_at
    ) values (
      v_job.user_id, v_job.task_key, p_last_started_at, p_last_success_at,
      p_next_run_at, p_last_error, v_finished_at
    )
    on conflict (user_id, task_key) do update set
      last_started_at = excluded.last_started_at,
      last_success_at = coalesce(excluded.last_success_at, sync_task_state.last_success_at),
      next_run_at = excluded.next_run_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at;
  end if;

  update public.sync_job_runs
  set status = p_status,
      finished_at = v_finished_at,
      error = p_last_error,
      details = coalesce(p_details, '{}'::jsonb),
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = null
  where id = v_job.id;
end;
$$;

revoke all on function public.claim_sync_jobs(uuid, integer, integer) from public;
revoke all on function public.heartbeat_sync_job(uuid, uuid, integer) from public;
revoke all on function public.complete_sync_job(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text, jsonb) from public;
grant execute on function public.claim_sync_jobs(uuid, integer, integer) to service_role;
grant execute on function public.heartbeat_sync_job(uuid, uuid, integer) to service_role;
grant execute on function public.complete_sync_job(uuid, uuid, text, timestamptz, timestamptz, timestamptz, text, jsonb) to service_role;
