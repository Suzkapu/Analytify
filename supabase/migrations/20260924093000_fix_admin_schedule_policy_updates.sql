-- Keep administrator policy changes compatible with the database safe-update
-- guard by touching only settings rows that actually need clamping.

create or replace function public.admin_update_sync_schedule_policy(
  p_task_key text, p_available boolean, p_interval_value integer, p_interval_unit text
) returns void
language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare v_minutes integer;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if p_task_key not in ('listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term') then
    raise exception 'Only personal schedules have administrator limits.';
  end if;
  if p_task_key <> 'listening_history' and not p_available then
    raise exception 'Only Listening History can be disabled globally.';
  end if;
  v_minutes := private.sync_interval_minutes(p_interval_value, p_interval_unit);
  insert into public.sync_schedule_policy(task_key, available, minimum_interval_minutes, updated_at, updated_by)
  values (p_task_key, p_available, v_minutes, now(), auth.uid())
  on conflict (task_key) do update set available = excluded.available,
    minimum_interval_minutes = excluded.minimum_interval_minutes,
    updated_at = now(), updated_by = auth.uid();

  if p_task_key = 'listening_history' then
    update public.sync_user_settings set
      history_enabled = history_enabled and p_available,
      history_interval_minutes = greatest(private.sync_interval_minutes(history_interval_minutes, history_interval_unit), v_minutes),
      history_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid()
    where (not p_available and history_enabled)
      or history_interval_unit <> 'minutes'
      or history_interval_minutes < v_minutes;
    if not p_available then
      update public.sync_task_state set next_run_at = null, updated_at = now()
        where task_key = p_task_key and next_run_at is not null;
      update public.sync_job_runs set status = 'cancelled', finished_at = now(),
        error = 'Cancelled because Listening History was disabled by the administrator.'
        where task_key = p_task_key and status = 'queued' and trigger_type = 'scheduled';
    end if;
  elsif p_task_key = 'stats_short_term' then
    update public.sync_user_settings set short_term_interval_hours =
      greatest(private.sync_interval_minutes(short_term_interval_hours, short_term_interval_unit), v_minutes),
      short_term_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid()
    where short_term_interval_unit <> 'minutes'
      or short_term_interval_hours < v_minutes;
  elsif p_task_key = 'stats_medium_term' then
    update public.sync_user_settings set medium_term_interval_hours =
      greatest(private.sync_interval_minutes(medium_term_interval_hours, medium_term_interval_unit), v_minutes),
      medium_term_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid()
    where medium_term_interval_unit <> 'minutes'
      or medium_term_interval_hours < v_minutes;
  else
    update public.sync_user_settings set long_term_interval_hours =
      greatest(private.sync_interval_minutes(long_term_interval_hours, long_term_interval_unit), v_minutes),
      long_term_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid()
    where long_term_interval_unit <> 'minutes'
      or long_term_interval_hours < v_minutes;
  end if;
  update public.sync_user_settings set enabled =
    history_enabled or short_term_enabled or medium_term_enabled or long_term_enabled
  where enabled is distinct from (history_enabled or short_term_enabled or medium_term_enabled or long_term_enabled);
end;
$$;

notify pgrst, 'reload schema';
