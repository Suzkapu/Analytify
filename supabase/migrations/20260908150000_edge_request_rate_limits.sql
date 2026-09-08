create table if not exists private.edge_request_limits (
  bucket text primary key check (length(bucket) between 10 and 160),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists edge_request_limits_updated_at_idx
  on private.edge_request_limits(updated_at);

revoke all on table private.edge_request_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.edge_request_limits to service_role;

create or replace function private.consume_edge_request_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row private.edge_request_limits%rowtype;
begin
  if length(coalesce(p_bucket, '')) not between 10 and 160
    or p_limit not between 1 and 1000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid Edge request limit.' using errcode = '22023';
  end if;

  insert into private.edge_request_limits(bucket, window_started_at, attempt_count, updated_at)
  values (p_bucket, v_now, 1, v_now)
  on conflict (bucket) do update set
    window_started_at = case
      when private.edge_request_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then v_now
      else private.edge_request_limits.window_started_at
    end,
    attempt_count = case
      when private.edge_request_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        then 1
      else least(private.edge_request_limits.attempt_count + 1, 2147483647)
    end,
    updated_at = v_now
  returning * into v_row;

  allowed := v_row.attempt_count <= p_limit;
  retry_after_seconds := case when allowed then 0 else greatest(1, ceil(extract(epoch from (
    v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
  )))::integer) end;
  return next;
end;
$$;

revoke all on function private.consume_edge_request_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function private.consume_edge_request_limit(text, integer, integer) to service_role;

create or replace function public.consume_edge_request_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, retry_after_seconds integer)
language sql
security definer
set search_path = ''
as $$
  select * from private.consume_edge_request_limit(p_bucket, p_limit, p_window_seconds)
$$;

revoke all on function public.consume_edge_request_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_request_limit(text, integer, integer) to service_role;

comment on table private.edge_request_limits is
  'Hashed, short-lived abuse-control counters for privileged Edge Function requests.';
