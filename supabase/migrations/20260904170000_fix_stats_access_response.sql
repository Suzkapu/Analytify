-- Use a versioned, explicitly typed response RPC so deployed PostgREST schema
-- caches and any legacy overloads cannot make consent answers ambiguous. The
-- operation is idempotent for a retry of the same decision, which also handles
-- a client losing the first successful response.
create or replace function public.answer_stats_access_request(
  p_request_id uuid,
  p_decision text
) returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_request public.stats_access_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if p_decision is null or p_decision not in ('approved', 'declined') then
    raise exception 'The stats request decision is invalid.';
  end if;

  select * into v_request
  from public.stats_access_requests
  where id = p_request_id
  for update;

  if not found or v_request.owner_user_id <> auth.uid() then
    raise exception 'Only the stats owner can answer this request.';
  end if;
  if v_request.status = p_decision then
    return v_request.status;
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This stats request has already been answered.';
  end if;

  update public.stats_access_requests
  set status = p_decision,
      responded_at = now(),
      revoked_at = null,
      updated_at = now()
  where id = p_request_id
    and owner_user_id = auth.uid()
    and status = 'pending'
  returning * into v_request;

  if not found then
    raise exception 'This stats request changed while it was being answered. Try again.';
  end if;
  return v_request.status;
end;
$$;

revoke all on function public.answer_stats_access_request(uuid, text) from public;
grant execute on function public.answer_stats_access_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
