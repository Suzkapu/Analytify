alter table public.sync_user_settings
  add column if not exists song_league_playlist_fridays_only boolean not null default true;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
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
  return query
  select
    profile.id, profile.spotify_id::text,
    coalesce(profile.display_name, 'Spotify user')::text,
    coalesce(profile.profile_pic_url, '')::text,
    profile.backup_active,
    (credential.user_id is not null or profile.spotify_refresh_token is not null),
    coalesce(settings.enabled, false), coalesce(settings.timezone, 'Europe/Vienna')::text,
    coalesce(settings.history_enabled, true), coalesce(settings.history_interval_minutes, 60),
    coalesce(settings.history_interval_unit, 'minutes')::text,
    coalesce(settings.short_term_enabled, true), coalesce(settings.short_term_interval_hours, 24),
    coalesce(settings.short_term_interval_unit, 'hours')::text,
    coalesce(settings.medium_term_enabled, true), coalesce(settings.medium_term_interval_hours, 168),
    coalesce(settings.medium_term_interval_unit, 'hours')::text,
    coalesce(settings.long_term_enabled, true), coalesce(settings.long_term_interval_hours, 168),
    coalesce(settings.long_term_interval_unit, 'hours')::text,
    coalesce(settings.song_league_playlists_enabled, true),
    coalesce(settings.song_league_playlist_fridays_only, true),
    coalesce(settings.song_league_playlist_interval_minutes, 60),
    coalesce(settings.song_league_playlist_interval_unit, 'minutes')::text,
    coalesce(settings.shared_playlists_enabled, true), coalesce(settings.shared_playlist_interval_minutes, 60),
    coalesce(settings.shared_playlist_interval_unit, 'minutes')::text,
    state.last_success_at, state.last_error
  from public.users profile
  left join public.spotify_credentials credential on credential.user_id = profile.id
  left join public.sync_user_settings settings on settings.user_id = profile.id
  left join lateral (
    select max(task.last_success_at) as last_success_at,
      (array_agg(task.last_error order by task.updated_at desc) filter (where task.last_error is not null))[1] as last_error
    from public.sync_task_state task where task.user_id = profile.id
  ) state on true
  where profile.spotify_id not like 'analytify_demo_bot_%'
  order by lower(coalesce(profile.display_name, profile.spotify_id));
end;
$$;

drop function if exists public.admin_update_sync_user(
  uuid, boolean, text,
  boolean, integer, text, boolean, integer, text, boolean, integer, text, boolean, integer, text,
  boolean, integer, text, boolean, integer, text
);
create function public.admin_update_sync_user(
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
    shared_playlists_enabled = excluded.shared_playlists_enabled, shared_playlist_interval_minutes = excluded.shared_playlist_interval_minutes, shared_playlist_interval_unit = excluded.shared_playlist_interval_unit,
    updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_update_sync_user(
  uuid, boolean, text,
  boolean, integer, text, boolean, integer, text, boolean, integer, text, boolean, integer, text,
  boolean, boolean, integer, text, boolean, integer, text
) from public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_sync_user(
  uuid, boolean, text,
  boolean, integer, text, boolean, integer, text, boolean, integer, text, boolean, integer, text,
  boolean, boolean, integer, text, boolean, integer, text
) to authenticated;
