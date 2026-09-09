-- Keep administrator-selected optional collection separate from collection that
-- is strictly required by a feature the user actively uses.
alter table public.sync_user_settings
  alter column history_enabled set default false,
  alter column short_term_enabled set default false,
  alter column medium_term_enabled set default false,
  alter column long_term_enabled set default false,
  alter column song_league_playlists_enabled set default false,
  alter column shared_playlists_enabled set default false,
  add column if not exists short_term_required boolean not null default false,
  add column if not exists song_league_playlists_required boolean not null default false,
  add column if not exists shared_playlists_required boolean not null default false;

-- Earlier league joins populated every optional flag through true defaults.
-- Historical rows do not reliably record whether a human chose those values,
-- so use the privacy-safe baseline for every account.
update public.sync_user_settings set
  enabled = false,
  history_enabled = false,
  short_term_enabled = false,
  medium_term_enabled = false,
  long_term_enabled = false,
  song_league_playlists_enabled = false,
  shared_playlists_enabled = false,
  updated_at = now();

update public.sync_task_state set next_run_at = null, updated_at = now();
update public.sync_job_runs set status = 'cancelled', finished_at = now(),
  error = 'Cancelled while automatic collection was reset to privacy-safe feature requirements.',
  details = details || jsonb_build_object('cancelled_by_feature_dependency_migration', true)
where status = 'queued' and trigger_type = 'scheduled';

create index if not exists playlist_share_downloads_recipient_idx
  on public.playlist_share_downloads(recipient_user_id);

create or replace function private.reconcile_sync_feature_dependencies(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare
  v_settings public.sync_user_settings%rowtype;
  v_old_short boolean;
  v_old_league_playlist boolean;
  v_old_share boolean;
  v_short boolean;
  v_league_playlist boolean;
  v_share boolean;
  v_task record;
  v_effective boolean;
  v_previous_required boolean;
  v_next timestamptz;
begin
  if p_user_id is null or not exists (select 1 from public.users where id = p_user_id) then return; end if;

  perform pg_advisory_xact_lock(hashtextextended('sync-feature:' || p_user_id::text, 0));

  insert into public.sync_user_settings(user_id, enabled)
  values (p_user_id, false) on conflict (user_id) do nothing;
  select * into v_settings from public.sync_user_settings where user_id = p_user_id for update;
  v_old_short := v_settings.short_term_required;
  v_old_league_playlist := v_settings.song_league_playlists_required;
  v_old_share := v_settings.shared_playlists_required;

  select exists (
    select 1 from public.song_league_members member
    join public.song_leagues league on league.id = member.league_id
    where member.user_id = p_user_id and member.left_at is null and league.closed_at is null
  ) into v_short;
  select exists (
    select 1 from public.song_league_playlists playlist
    join public.song_league_members member on member.league_id = playlist.league_id
      and member.user_id = playlist.user_id and member.left_at is null
    join public.song_leagues league on league.id = playlist.league_id and league.closed_at is null
    where playlist.user_id = p_user_id
  ) into v_league_playlist;
  select exists (
    select 1 from public.playlist_shares share
    where share.owner_user_id = p_user_id and share.revoked_at is null
      and (share.recipient_user_id is not null or share.claim_expires_at > now())
    union all
    select 1 from public.playlist_shares share
    join public.playlist_share_downloads download on download.share_id = share.id
      and download.recipient_user_id = p_user_id
    where share.recipient_user_id = p_user_id and share.revoked_at is null
  ) into v_share;

  if v_old_short = v_short and v_old_league_playlist = v_league_playlist and v_old_share = v_share
    and (not v_short or exists (select 1 from public.sync_task_state where user_id = p_user_id and task_key = 'stats_short_term'))
    and (not v_league_playlist or exists (select 1 from public.sync_task_state where user_id = p_user_id and task_key = 'song_league_playlists'))
    and (not v_share or exists (select 1 from public.sync_task_state where user_id = p_user_id and task_key = 'shared_playlists')) then
    return;
  end if;

  update public.sync_user_settings set
    short_term_required = v_short,
    song_league_playlists_required = v_league_playlist,
    shared_playlists_required = v_share,
    updated_at = now()
  where user_id = p_user_id
  returning * into v_settings;

  for v_task in select * from (values
    ('stats_short_term', v_old_short, v_short,
      v_settings.enabled and v_settings.short_term_enabled),
    ('song_league_playlists', v_old_league_playlist, v_league_playlist,
      v_settings.enabled and v_settings.song_league_playlists_enabled),
    ('shared_playlists', v_old_share, v_share,
      v_settings.enabled and v_settings.shared_playlists_enabled)
  ) as task(task_key, old_required, required, optional_enabled)
  loop
    v_effective := v_task.required or v_task.optional_enabled;
    v_previous_required := v_task.old_required;
    select state.next_run_at into v_next from public.sync_task_state state
      where state.user_id = p_user_id and state.task_key = v_task.task_key;
    if not v_effective then
      v_next := null;
    elsif v_task.required and (not v_previous_required or v_next is null) then
      v_next := now();
    end if;
    insert into public.sync_task_state(user_id, task_key, next_run_at, last_error, updated_at)
      values (p_user_id, v_task.task_key, v_next, null, now())
    on conflict (user_id, task_key) do update set
      next_run_at = excluded.next_run_at,
      last_error = case when v_task.required and not v_previous_required then null
        else public.sync_task_state.last_error end,
      updated_at = now();

    if not v_effective then
      update public.sync_job_runs run set status = 'cancelled', finished_at = now(),
        error = 'Cancelled because the feature no longer requires this automatic task.',
        details = run.details || jsonb_build_object('cancelled_by_feature_dependency', true)
      where run.user_id = p_user_id and run.task_key = v_task.task_key
        and run.status = 'queued' and run.trigger_type = 'scheduled';
    end if;
  end loop;
end;
$$;

-- Retain the existing narrow league hook, but stop it from changing any
-- administrator-owned optional flags.
create or replace function private.enable_song_league_sync_for_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, private
as $$
begin
  if p_user_id is null then raise exception 'A Song League member is required.'; end if;
  perform private.reconcile_sync_feature_dependencies(p_user_id);
end;
$$;

create or replace function private.reconcile_sync_dependency_row()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  if tg_table_name = 'playlist_shares' then
    if tg_op <> 'DELETE' then
      perform private.reconcile_sync_feature_dependencies(new.owner_user_id);
      perform private.reconcile_sync_feature_dependencies(new.recipient_user_id);
    end if;
    if tg_op <> 'INSERT' then
      perform private.reconcile_sync_feature_dependencies(old.owner_user_id);
      perform private.reconcile_sync_feature_dependencies(old.recipient_user_id);
    end if;
  elsif tg_table_name = 'playlist_share_downloads' then
    perform private.reconcile_sync_feature_dependencies(
      case when tg_op = 'DELETE' then old.recipient_user_id else new.recipient_user_id end
    );
  elsif tg_table_name = 'song_league_playlists' then
    perform private.reconcile_sync_feature_dependencies(
      case when tg_op = 'DELETE' then old.user_id else new.user_id end
    );
  else
    perform private.reconcile_sync_feature_dependencies(
      case when tg_op = 'DELETE' then old.user_id else new.user_id end
    );
  end if;
  return null;
end;
$$;

drop trigger if exists enable_song_league_member_sync on public.song_league_members;
drop trigger if exists reconcile_member_sync_dependencies on public.song_league_members;
create trigger reconcile_member_sync_dependencies
after insert or update of left_at or delete on public.song_league_members
for each row execute function private.reconcile_sync_dependency_row();

drop trigger if exists reconcile_league_playlist_sync_dependencies on public.song_league_playlists;
create trigger reconcile_league_playlist_sync_dependencies
after insert or delete on public.song_league_playlists
for each row execute function private.reconcile_sync_dependency_row();

drop trigger if exists reconcile_playlist_share_sync_dependencies on public.playlist_shares;
create trigger reconcile_playlist_share_sync_dependencies
after insert or update of revoked_at, recipient_user_id, claim_expires_at or delete on public.playlist_shares
for each row execute function private.reconcile_sync_dependency_row();

drop trigger if exists reconcile_playlist_download_sync_dependencies on public.playlist_share_downloads;
create trigger reconcile_playlist_download_sync_dependencies
after insert or delete on public.playlist_share_downloads
for each row execute function private.reconcile_sync_dependency_row();

create or replace function private.reconcile_closed_league_sync_dependencies()
returns trigger language plpgsql security definer set search_path = public, private
as $$
declare v_user_id uuid;
begin
  if old.closed_at is distinct from new.closed_at then
    for v_user_id in select member.user_id from public.song_league_members member where member.league_id = new.id
    loop perform private.reconcile_sync_feature_dependencies(v_user_id); end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists reconcile_closed_league_sync_dependencies on public.song_leagues;
create trigger reconcile_closed_league_sync_dependencies
after update of closed_at on public.song_leagues
for each row execute function private.reconcile_closed_league_sync_dependencies();

create or replace function public.admin_list_required_sync_reasons()
returns table(user_id uuid, required_tasks jsonb)
language sql stable security definer set search_path = public, private
as $$
  select settings.user_id, jsonb_strip_nulls(jsonb_build_object(
    'stats_short_term', case when settings.short_term_required then 'Required by active Song League membership' end,
    'song_league_playlists', case when settings.song_league_playlists_required then 'Required by a weekly playlist you created' end,
    'shared_playlists', case when settings.shared_playlists_required then 'Required by an auto-updating shared playlist' end
  ))
  from public.sync_user_settings settings
  where private.is_app_admin(auth.uid());
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid, spotify_id text, display_name text, profile_pic_url text,
  backup_active boolean, has_refresh_token boolean, enabled boolean, timezone text,
  history_enabled boolean, history_interval_minutes integer, history_interval_unit text,
  short_term_enabled boolean, short_term_interval_hours integer, short_term_interval_unit text,
  medium_term_enabled boolean, medium_term_interval_hours integer, medium_term_interval_unit text,
  long_term_enabled boolean, long_term_interval_hours integer, long_term_interval_unit text,
  song_league_playlists_enabled boolean, song_league_playlist_fridays_only boolean,
  song_league_playlist_interval_minutes integer, song_league_playlist_interval_unit text,
  shared_playlists_enabled boolean, shared_playlist_interval_minutes integer, shared_playlist_interval_unit text,
  last_success_at timestamptz, last_error text
)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  return query select profile.id, profile.spotify_id::text,
    coalesce(profile.display_name, 'Spotify user')::text, coalesce(profile.profile_pic_url, '')::text,
    profile.backup_active, (credential.user_id is not null or profile.spotify_refresh_token is not null),
    coalesce(settings.enabled, false), coalesce(settings.timezone, 'Europe/Vienna')::text,
    coalesce(settings.history_enabled, false), coalesce(settings.history_interval_minutes, 60),
    coalesce(settings.history_interval_unit, 'minutes')::text,
    coalesce(settings.short_term_enabled, false), coalesce(settings.short_term_interval_hours, 24),
    coalesce(settings.short_term_interval_unit, 'hours')::text,
    coalesce(settings.medium_term_enabled, false), coalesce(settings.medium_term_interval_hours, 168),
    coalesce(settings.medium_term_interval_unit, 'hours')::text,
    coalesce(settings.long_term_enabled, false), coalesce(settings.long_term_interval_hours, 168),
    coalesce(settings.long_term_interval_unit, 'hours')::text,
    coalesce(settings.song_league_playlists_enabled, false), coalesce(settings.song_league_playlist_fridays_only, true),
    coalesce(settings.song_league_playlist_interval_minutes, 60),
    coalesce(settings.song_league_playlist_interval_unit, 'minutes')::text,
    coalesce(settings.shared_playlists_enabled, false), coalesce(settings.shared_playlist_interval_minutes, 60),
    coalesce(settings.shared_playlist_interval_unit, 'minutes')::text,
    state.last_success_at, state.last_error
  from public.users profile
  left join public.spotify_credentials credential on credential.user_id = profile.id
  left join public.sync_user_settings settings on settings.user_id = profile.id
  left join lateral (
    select max(task.last_success_at) as last_success_at,
      (array_agg(task.last_error order by task.updated_at desc)
        filter (where task.last_error is not null))[1] as last_error
    from public.sync_task_state task where task.user_id = profile.id
  ) state on true
  where profile.spotify_id not like 'analytify_demo_bot_%'
  order by lower(coalesce(profile.display_name, profile.spotify_id));
end;
$$;

create or replace function public.get_my_sync_task_status()
returns table(task_key text, optional_enabled boolean, feature_required boolean,
  effective_active boolean, reasons text[])
language sql stable security definer set search_path = public, private
as $$
  with settings as (
    select * from public.sync_user_settings where user_id = auth.uid()
  )
  select task.task_key, task.optional_enabled, task.feature_required,
    task.feature_required or (settings.enabled and task.optional_enabled),
    case when task.feature_required then array[task.reason]::text[] else '{}'::text[] end
  from settings
  cross join lateral (values
    ('listening_history', settings.history_enabled, false, null::text),
    ('stats_short_term', settings.short_term_enabled, settings.short_term_required,
      'Active because you are in a Song League'),
    ('stats_medium_term', settings.medium_term_enabled, false, null::text),
    ('stats_long_term', settings.long_term_enabled, false, null::text),
    ('song_league_playlists', settings.song_league_playlists_enabled,
      settings.song_league_playlists_required, 'Active because you created a weekly league playlist'),
    ('shared_playlists', settings.shared_playlists_enabled, settings.shared_playlists_required,
      'Active because you publish or downloaded an auto-updating shared playlist')
  ) as task(task_key, optional_enabled, feature_required, reason);
$$;

-- Saving administrator-owned optional schedules must not disable work that an
-- active user feature requires, nor cancel unrelated queued work.
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
  v_current public.sync_user_settings%rowtype;
  v_task record;
  v_old_effective boolean;
  v_new_effective boolean;
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
    updated_at = now(), updated_by = auth.uid()
  returning * into v_current;

  for v_task in select * from (values
    ('listening_history', coalesce(v_old.history_enabled, false), p_history_enabled, false, p_history_interval_minutes, p_history_interval_unit, false),
    ('stats_short_term', coalesce(v_old.short_term_enabled, false), p_short_term_enabled, v_current.short_term_required, p_short_term_interval_hours, p_short_term_interval_unit, false),
    ('stats_medium_term', coalesce(v_old.medium_term_enabled, false), p_medium_term_enabled, false, p_medium_term_interval_hours, p_medium_term_interval_unit, false),
    ('stats_long_term', coalesce(v_old.long_term_enabled, false), p_long_term_enabled, false, p_long_term_interval_hours, p_long_term_interval_unit, false),
    ('song_league_playlists', coalesce(v_old.song_league_playlists_enabled, false), p_song_league_playlists_enabled, v_current.song_league_playlists_required, p_song_league_playlist_interval_minutes, p_song_league_playlist_interval_unit, p_song_league_playlist_fridays_only),
    ('shared_playlists', coalesce(v_old.shared_playlists_enabled, false), p_shared_playlists_enabled, v_current.shared_playlists_required, p_shared_playlist_interval_minutes, p_shared_playlist_interval_unit, false)
  ) as task(task_key, old_optional, new_optional, feature_required, interval_value, interval_unit, friday_only)
  loop
    v_old_effective := v_task.feature_required or (coalesce(v_old.enabled, false) and v_task.old_optional);
    v_new_effective := v_task.feature_required or (p_enabled and v_task.new_optional);
    select next_run_at into v_next from public.sync_task_state
      where user_id = p_user_id and task_key = v_task.task_key;
    if not v_new_effective then v_next := null;
    elsif not v_old_effective or v_next is null then v_next := now();
    elsif not v_task.feature_required and p_enabled and v_task.new_optional then
      v_next := now() + private.sync_interval(v_task.interval_value, v_task.interval_unit);
    end if;
    v_next := private.next_eligible_sync_time(v_next, p_timezone, v_task.friday_only);
    insert into public.sync_task_state(user_id, task_key, next_run_at, last_error, updated_at)
      values (p_user_id, v_task.task_key, v_next, null, now())
    on conflict (user_id, task_key) do update set
      next_run_at = excluded.next_run_at, last_error = null, updated_at = now();
    if not v_new_effective then
      update public.sync_job_runs set status = 'cancelled', finished_at = now(),
        error = 'Cancelled because this automatic task is no longer active.',
        details = details || jsonb_build_object('cancelled_by_schedule_change', true)
      where user_id = p_user_id and task_key = v_task.task_key
        and status = 'queued' and trigger_type = 'scheduled';
    end if;
  end loop;
end;
$$;

revoke all on function private.reconcile_sync_feature_dependencies(uuid) from public, anon, authenticated;
revoke all on function private.reconcile_sync_dependency_row() from public, anon, authenticated;
revoke all on function private.reconcile_closed_league_sync_dependencies() from public, anon, authenticated;
revoke all on function public.admin_list_required_sync_reasons() from public, anon;
grant execute on function public.admin_list_required_sync_reasons() to authenticated;
revoke all on function public.get_my_sync_task_status() from public, anon;
grant execute on function public.get_my_sync_task_status() to authenticated;

-- Recalculate every current account after the new privacy-preserving defaults.
do $$ declare v_user_id uuid; begin
  for v_user_id in select id from public.users
  loop perform private.reconcile_sync_feature_dependencies(v_user_id); end loop;
end $$;

notify pgrst, 'reload schema';
