-- Schedule edits are control-plane operations: rebasing task state and
-- cancelling newly ineligible automatic work must commit with the settings.
create or replace function private.sync_interval(p_value integer, p_unit text)
returns interval language sql immutable set search_path = pg_catalog as $$
  select case p_unit
    when 'minutes' then make_interval(mins => greatest(1, p_value))
    when 'hours' then make_interval(hours => greatest(1, p_value))
    when 'days' then make_interval(days => greatest(1, p_value))
    else null
  end;
$$;

create or replace function private.next_eligible_sync_time(
  p_target timestamptz, p_timezone text, p_friday_only boolean
) returns timestamptz language plpgsql stable set search_path = pg_catalog as $$
declare
  v_local timestamp;
  v_days integer;
begin
  if not p_friday_only then return p_target; end if;
  v_local := p_target at time zone p_timezone;
  v_days := (5 - extract(isodow from v_local)::integer + 7) % 7;
  return (v_local + make_interval(days => v_days)) at time zone p_timezone;
end;
$$;

create or replace function public.admin_update_sync_user(
  p_user_id uuid, p_enabled boolean, p_timezone text,
  p_history_enabled boolean, p_history_interval_minutes integer, p_history_interval_unit text,
  p_short_term_enabled boolean, p_short_term_interval_hours integer, p_short_term_interval_unit text,
  p_medium_term_enabled boolean, p_medium_term_interval_hours integer, p_medium_term_interval_unit text,
  p_long_term_enabled boolean, p_long_term_interval_hours integer, p_long_term_interval_unit text,
  p_song_league_playlists_enabled boolean, p_song_league_playlist_fridays_only boolean,
  p_song_league_playlist_interval_minutes integer, p_song_league_playlist_interval_unit text,
  p_shared_playlists_enabled boolean, p_shared_playlist_interval_minutes integer, p_shared_playlist_interval_unit text
) returns void
language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare
  v_old public.sync_user_settings%rowtype;
  v_task record;
  v_was_enabled boolean;
  v_next timestamptz;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'The synchronization timezone is invalid.';
  end if;
  if p_history_interval_unit not in ('minutes', 'hours', 'days')
    or p_short_term_interval_unit not in ('minutes', 'hours', 'days')
    or p_medium_term_interval_unit not in ('minutes', 'hours', 'days')
    or p_long_term_interval_unit not in ('minutes', 'hours', 'days')
    or p_song_league_playlist_interval_unit not in ('minutes', 'hours', 'days')
    or p_shared_playlist_interval_unit not in ('minutes', 'hours', 'days') then
    raise exception 'The synchronization interval unit is invalid.';
  end if;

  select * into v_old from public.sync_user_settings where user_id = p_user_id for update;
  insert into public.sync_user_settings(
    user_id, enabled, timezone,
    history_enabled, history_interval_minutes, history_interval_unit,
    short_term_enabled, short_term_interval_hours, short_term_interval_unit,
    medium_term_enabled, medium_term_interval_hours, medium_term_interval_unit,
    long_term_enabled, long_term_interval_hours, long_term_interval_unit,
    song_league_playlists_enabled, song_league_playlist_fridays_only,
    song_league_playlist_interval_minutes, song_league_playlist_interval_unit,
    shared_playlists_enabled, shared_playlist_interval_minutes, shared_playlist_interval_unit,
    updated_at, updated_by
  ) values (
    p_user_id, p_enabled, p_timezone,
    p_history_enabled, p_history_interval_minutes, p_history_interval_unit,
    p_short_term_enabled, p_short_term_interval_hours, p_short_term_interval_unit,
    p_medium_term_enabled, p_medium_term_interval_hours, p_medium_term_interval_unit,
    p_long_term_enabled, p_long_term_interval_hours, p_long_term_interval_unit,
    p_song_league_playlists_enabled, p_song_league_playlist_fridays_only,
    p_song_league_playlist_interval_minutes, p_song_league_playlist_interval_unit,
    p_shared_playlists_enabled, p_shared_playlist_interval_minutes, p_shared_playlist_interval_unit,
    now(), auth.uid()
  ) on conflict (user_id) do update set
    enabled = excluded.enabled, timezone = excluded.timezone,
    history_enabled = excluded.history_enabled, history_interval_minutes = excluded.history_interval_minutes, history_interval_unit = excluded.history_interval_unit,
    short_term_enabled = excluded.short_term_enabled, short_term_interval_hours = excluded.short_term_interval_hours, short_term_interval_unit = excluded.short_term_interval_unit,
    medium_term_enabled = excluded.medium_term_enabled, medium_term_interval_hours = excluded.medium_term_interval_hours, medium_term_interval_unit = excluded.medium_term_interval_unit,
    long_term_enabled = excluded.long_term_enabled, long_term_interval_hours = excluded.long_term_interval_hours, long_term_interval_unit = excluded.long_term_interval_unit,
    song_league_playlists_enabled = excluded.song_league_playlists_enabled,
    song_league_playlist_fridays_only = excluded.song_league_playlist_fridays_only,
    song_league_playlist_interval_minutes = excluded.song_league_playlist_interval_minutes,
    song_league_playlist_interval_unit = excluded.song_league_playlist_interval_unit,
    shared_playlists_enabled = excluded.shared_playlists_enabled,
    shared_playlist_interval_minutes = excluded.shared_playlist_interval_minutes,
    shared_playlist_interval_unit = excluded.shared_playlist_interval_unit,
    updated_at = now(), updated_by = auth.uid();

  for v_task in select * from (values
    ('listening_history', p_history_enabled, p_history_interval_minutes, p_history_interval_unit, false),
    ('stats_short_term', p_short_term_enabled, p_short_term_interval_hours, p_short_term_interval_unit, false),
    ('stats_medium_term', p_medium_term_enabled, p_medium_term_interval_hours, p_medium_term_interval_unit, false),
    ('stats_long_term', p_long_term_enabled, p_long_term_interval_hours, p_long_term_interval_unit, false),
    ('song_league_playlists', p_song_league_playlists_enabled, p_song_league_playlist_interval_minutes, p_song_league_playlist_interval_unit, p_song_league_playlist_fridays_only),
    ('shared_playlists', p_shared_playlists_enabled, p_shared_playlist_interval_minutes, p_shared_playlist_interval_unit, false)
  ) as task(task_key, task_enabled, interval_value, interval_unit, friday_only)
  loop
    v_was_enabled := coalesce(v_old.enabled, false) and case v_task.task_key
      when 'listening_history' then coalesce(v_old.history_enabled, false)
      when 'stats_short_term' then coalesce(v_old.short_term_enabled, false)
      when 'stats_medium_term' then coalesce(v_old.medium_term_enabled, false)
      when 'stats_long_term' then coalesce(v_old.long_term_enabled, false)
      when 'song_league_playlists' then coalesce(v_old.song_league_playlists_enabled, false)
      when 'shared_playlists' then coalesce(v_old.shared_playlists_enabled, false)
      else false end;
    if p_enabled and v_task.task_enabled then
      -- Newly enabled tasks are due immediately. Existing schedules rebase from
      -- the save time, so both shorter and longer intervals take effect now.
      v_next := case when v_was_enabled then now() + private.sync_interval(v_task.interval_value, v_task.interval_unit) else now() end;
      v_next := private.next_eligible_sync_time(v_next, p_timezone, v_task.friday_only);
    else
      v_next := null;
    end if;
    insert into public.sync_task_state(user_id, task_key, next_run_at, last_error, updated_at)
      values (p_user_id, v_task.task_key, v_next, null, now())
    on conflict (user_id, task_key) do update set
      next_run_at = excluded.next_run_at, last_error = null, updated_at = now();
  end loop;

  update public.sync_job_runs run set
    status = 'cancelled', finished_at = now(),
    error = 'Cancelled because the automatic schedule changed.',
    details = run.details || jsonb_build_object('cancelled_by_schedule_change', true)
  where run.user_id = p_user_id and run.status = 'queued' and run.trigger_type = 'scheduled';
end;
$$;

create or replace function public.admin_list_schedule_status()
returns table(user_id uuid, next_effective_run_at timestamptz, manual_job_retained boolean)
language sql stable security definer set search_path = public, private
as $$
  select profile.id,
    min(state.next_run_at) filter (where state.next_run_at is not null),
    exists(select 1 from public.sync_job_runs run where run.user_id = profile.id
      and run.trigger_type = 'manual' and run.status in ('queued', 'running'))
  from public.users profile
  left join public.sync_task_state state on state.user_id = profile.id
  where private.is_app_admin(auth.uid())
  group by profile.id;
$$;

revoke all on function public.admin_list_schedule_status() from public;
grant execute on function public.admin_list_schedule_status() to authenticated;
revoke all on function private.sync_interval(integer, text) from public, anon, authenticated;
revoke all on function private.next_eligible_sync_time(timestamptz, text, boolean) from public, anon, authenticated;
