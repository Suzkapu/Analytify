-- User-owned optional schedules constrained by administrator policy.
create table public.sync_schedule_policy (
  task_key text primary key check (task_key in (
    'listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term'
  )),
  available boolean not null default true,
  minimum_interval_minutes integer not null check (minimum_interval_minutes between 1 and 10080),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.sync_schedule_policy(task_key, available, minimum_interval_minutes) values
  ('listening_history', true, 60),
  ('stats_short_term', true, 1440),
  ('stats_medium_term', true, 10080),
  ('stats_long_term', true, 10080)
on conflict (task_key) do nothing;

alter table public.sync_schedule_policy enable row level security;
grant select on public.sync_schedule_policy to authenticated;
grant all on public.sync_schedule_policy to service_role;

create policy sync_schedule_policy_read on public.sync_schedule_policy
for select to authenticated using (true);

create or replace function private.sync_interval_minutes(p_value integer, p_unit text)
returns integer language plpgsql immutable set search_path = pg_catalog
as $$
declare v_multiplier integer;
begin
  if p_value is null or p_value < 1 then
    raise exception 'The synchronization interval must be at least 1.';
  end if;
  v_multiplier := case p_unit when 'minutes' then 1 when 'hours' then 60 when 'days' then 1440 else null end;
  if v_multiplier is null then raise exception 'The synchronization interval unit is invalid.'; end if;
  if p_value > 10080 or p_value * v_multiplier > 10080 then
    raise exception 'The synchronization interval is too large.';
  end if;
  return p_value * v_multiplier;
end;
$$;

create or replace function private.enforce_personal_sync_policy()
returns trigger language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare v_policy record;
begin
  for v_policy in select * from public.sync_schedule_policy loop
    if v_policy.task_key = 'listening_history' then
      if not v_policy.available then new.history_enabled := false; end if;
      if new.history_enabled and private.sync_interval_minutes(new.history_interval_minutes, new.history_interval_unit) < v_policy.minimum_interval_minutes then
        raise exception 'Listening History interval is more frequent than the administrator allows.';
      end if;
    elsif v_policy.task_key = 'stats_short_term' and new.short_term_enabled
      and private.sync_interval_minutes(new.short_term_interval_hours, new.short_term_interval_unit) < v_policy.minimum_interval_minutes then
      raise exception 'Short-term stats interval is more frequent than the administrator allows.';
    elsif v_policy.task_key = 'stats_medium_term' and new.medium_term_enabled
      and private.sync_interval_minutes(new.medium_term_interval_hours, new.medium_term_interval_unit) < v_policy.minimum_interval_minutes then
      raise exception 'Medium-term stats interval is more frequent than the administrator allows.';
    elsif v_policy.task_key = 'stats_long_term' and new.long_term_enabled
      and private.sync_interval_minutes(new.long_term_interval_hours, new.long_term_interval_unit) < v_policy.minimum_interval_minutes then
      raise exception 'Long-term stats interval is more frequent than the administrator allows.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists enforce_personal_sync_policy on public.sync_user_settings;
create trigger enforce_personal_sync_policy before insert or update on public.sync_user_settings
for each row execute function private.enforce_personal_sync_policy();

drop function if exists public.get_my_sync_task_status();
create function public.get_my_sync_task_status()
returns table(
  task_key text, optional_enabled boolean, feature_required boolean,
  effective_active boolean, reasons text[], editable boolean,
  interval_value integer, interval_unit text,
  minimum_interval_minutes integer, policy_available boolean
)
language sql stable security definer set search_path = public, private
as $$
  with settings as (
    select * from public.sync_user_settings where user_id = auth.uid()
  )
  select task.task_key, task.optional_enabled, task.feature_required,
    task.feature_required or (settings.enabled and task.optional_enabled),
    case
      when task.feature_required then array[task.reason]::text[]
      when task.editable and not coalesce(policy.available, true)
        then array['Disabled by the administrator']::text[]
      when task.editable and not task.optional_enabled
        then array['Disabled by you']::text[]
      else '{}'::text[]
    end,
    task.editable,
    task.interval_value,
    task.interval_unit,
    coalesce(policy.minimum_interval_minutes, 1),
    coalesce(policy.available, true)
  from settings
  cross join lateral (values
    ('listening_history', settings.history_enabled, false, null::text, true,
      settings.history_interval_minutes, settings.history_interval_unit),
    ('stats_short_term', settings.short_term_enabled, settings.short_term_required,
      'Active because you are in a Song League', true,
      settings.short_term_interval_hours, settings.short_term_interval_unit),
    ('stats_medium_term', settings.medium_term_enabled, false, null::text, true,
      settings.medium_term_interval_hours, settings.medium_term_interval_unit),
    ('stats_long_term', settings.long_term_enabled, false, null::text, true,
      settings.long_term_interval_hours, settings.long_term_interval_unit),
    ('song_league_playlists', settings.song_league_playlists_enabled,
      settings.song_league_playlists_required, 'Active because you created a weekly league playlist', false,
      settings.song_league_playlist_interval_minutes, settings.song_league_playlist_interval_unit),
    ('shared_playlists', settings.shared_playlists_enabled, settings.shared_playlists_required,
      'Active because you publish or downloaded an auto-updating shared playlist', false,
      settings.shared_playlist_interval_minutes, settings.shared_playlist_interval_unit)
  ) as task(task_key, optional_enabled, feature_required, reason, editable, interval_value, interval_unit)
  left join public.sync_schedule_policy policy on policy.task_key = task.task_key;
$$;

create or replace function public.update_my_sync_schedule_preference(
  p_task_key text, p_enabled boolean, p_interval_value integer, p_interval_unit text
) returns void
language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy public.sync_schedule_policy%rowtype;
  v_minutes integer;
  v_required boolean := false;
  v_any_enabled boolean;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_task_key not in ('listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term') then
    raise exception 'This automatic task is controlled by the feature that requires it.';
  end if;
  select * into v_policy from public.sync_schedule_policy where task_key = p_task_key for share;
  if not found then raise exception 'The synchronization policy is unavailable.'; end if;
  v_minutes := private.sync_interval_minutes(p_interval_value, p_interval_unit);
  if p_enabled and not v_policy.available then raise exception 'This automatic task is disabled by the administrator.'; end if;
  if v_minutes < v_policy.minimum_interval_minutes then
    raise exception 'The selected interval is more frequent than the administrator allows.';
  end if;

  insert into public.sync_user_settings(user_id, enabled) values (v_user_id, false)
  on conflict (user_id) do nothing;
  if p_task_key = 'listening_history' then
    update public.sync_user_settings set history_enabled = p_enabled,
      history_interval_minutes = p_interval_value, history_interval_unit = p_interval_unit,
      updated_at = now(), updated_by = v_user_id where user_id = v_user_id;
  elsif p_task_key = 'stats_short_term' then
    update public.sync_user_settings set short_term_enabled = p_enabled,
      short_term_interval_hours = p_interval_value, short_term_interval_unit = p_interval_unit,
      updated_at = now(), updated_by = v_user_id where user_id = v_user_id
      returning short_term_required into v_required;
  elsif p_task_key = 'stats_medium_term' then
    update public.sync_user_settings set medium_term_enabled = p_enabled,
      medium_term_interval_hours = p_interval_value, medium_term_interval_unit = p_interval_unit,
      updated_at = now(), updated_by = v_user_id where user_id = v_user_id;
  else
    update public.sync_user_settings set long_term_enabled = p_enabled,
      long_term_interval_hours = p_interval_value, long_term_interval_unit = p_interval_unit,
      updated_at = now(), updated_by = v_user_id where user_id = v_user_id;
  end if;

  update public.sync_user_settings set enabled =
    history_enabled or short_term_enabled or medium_term_enabled or long_term_enabled,
    updated_at = now(), updated_by = v_user_id
  where user_id = v_user_id returning enabled into v_any_enabled;

  insert into public.sync_task_state(user_id, task_key, next_run_at, last_error, updated_at)
  values (v_user_id, p_task_key,
    case when p_enabled or v_required then now() else null end, null, now())
  on conflict (user_id, task_key) do update set
    next_run_at = case when p_enabled or v_required then now() else null end,
    last_error = null, updated_at = now();

  if not p_enabled and not v_required then
    update public.sync_job_runs set status = 'cancelled', finished_at = now(),
      error = 'Cancelled because you disabled this automatic task.',
      details = details || jsonb_build_object('cancelled_by_user_preference', true)
    where user_id = v_user_id and task_key = p_task_key
      and status = 'queued' and trigger_type = 'scheduled';
  end if;
end;
$$;

create or replace function public.admin_list_sync_schedule_policy()
returns table(task_key text, available boolean, minimum_interval_minutes integer)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  return query select policy.task_key, policy.available, policy.minimum_interval_minutes
    from public.sync_schedule_policy policy order by policy.task_key;
end;
$$;

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

  -- Existing choices are clamped immediately and stored in minutes so the
  -- worker can never run faster than the new limit.
  if p_task_key = 'listening_history' then
    update public.sync_user_settings set
      history_enabled = history_enabled and p_available,
      history_interval_minutes = greatest(private.sync_interval_minutes(history_interval_minutes, history_interval_unit), v_minutes),
      history_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid();
    if not p_available then
      update public.sync_task_state set next_run_at = null, updated_at = now()
        where task_key = p_task_key;
      update public.sync_job_runs set status = 'cancelled', finished_at = now(),
        error = 'Cancelled because Listening History was disabled by the administrator.'
        where task_key = p_task_key and status = 'queued' and trigger_type = 'scheduled';
    end if;
  elsif p_task_key = 'stats_short_term' then
    update public.sync_user_settings set short_term_interval_hours =
      greatest(private.sync_interval_minutes(short_term_interval_hours, short_term_interval_unit), v_minutes),
      short_term_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid();
  elsif p_task_key = 'stats_medium_term' then
    update public.sync_user_settings set medium_term_interval_hours =
      greatest(private.sync_interval_minutes(medium_term_interval_hours, medium_term_interval_unit), v_minutes),
      medium_term_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid();
  else
    update public.sync_user_settings set long_term_interval_hours =
      greatest(private.sync_interval_minutes(long_term_interval_hours, long_term_interval_unit), v_minutes),
      long_term_interval_unit = 'minutes', updated_at = now(), updated_by = auth.uid();
  end if;
  update public.sync_user_settings set enabled =
    history_enabled or short_term_enabled or medium_term_enabled or long_term_enabled;
end;
$$;

revoke all on function private.sync_interval_minutes(integer, text) from public, anon, authenticated;
revoke all on function private.enforce_personal_sync_policy() from public, anon, authenticated;
revoke all on function public.get_my_sync_task_status() from public, anon;
grant execute on function public.get_my_sync_task_status() to authenticated;
revoke all on function public.update_my_sync_schedule_preference(text, boolean, integer, text) from public, anon;
grant execute on function public.update_my_sync_schedule_preference(text, boolean, integer, text) to authenticated;
revoke all on function public.admin_list_sync_schedule_policy() from public, anon;
grant execute on function public.admin_list_sync_schedule_policy() to authenticated;
revoke all on function public.admin_update_sync_schedule_policy(text, boolean, integer, text) from public, anon;
grant execute on function public.admin_update_sync_schedule_policy(text, boolean, integer, text) to authenticated;

notify pgrst, 'reload schema';
