-- Admin control plane, configurable synchronization jobs, and Song League demos.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.app_admins (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create table if not exists public.site_settings (
  singleton boolean primary key default true check (singleton),
  announcement text not null default '',
  allow_song_league_creation boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.site_settings(singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists public.sync_user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null default 'Europe/Vienna',
  history_enabled boolean not null default true,
  history_interval_minutes integer not null default 60 check (history_interval_minutes between 15 and 10080),
  short_term_enabled boolean not null default true,
  short_term_interval_hours integer not null default 24 check (short_term_interval_hours between 1 and 720),
  medium_term_enabled boolean not null default true,
  medium_term_interval_hours integer not null default 168 check (medium_term_interval_hours between 1 and 2160),
  long_term_enabled boolean not null default true,
  long_term_interval_hours integer not null default 168 check (long_term_interval_hours between 1 and 2160),
  song_league_playlists_enabled boolean not null default true,
  song_league_playlist_interval_minutes integer not null default 60 check (song_league_playlist_interval_minutes between 15 and 10080),
  shared_playlists_enabled boolean not null default true,
  shared_playlist_interval_minutes integer not null default 60 check (shared_playlist_interval_minutes between 15 and 10080),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.sync_user_settings(user_id, enabled)
select id, false from public.users
on conflict (user_id) do nothing;

create or replace function private.initialize_sync_user_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sync_user_settings(user_id, enabled)
  values (new.id, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_sync_user_settings on public.users;
create trigger initialize_sync_user_settings
after insert on public.users
for each row execute function private.initialize_sync_user_settings();

create table if not exists public.sync_task_state (
  user_id uuid not null references public.users(id) on delete cascade,
  task_key text not null check (task_key in (
    'listening_history', 'stats_short_term', 'stats_medium_term',
    'stats_long_term', 'song_league_playlists', 'shared_playlists'
  )),
  last_started_at timestamptz,
  last_success_at timestamptz,
  next_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_key)
);

create table if not exists public.sync_job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  task_key text not null check (task_key in (
    'listening_history', 'stats_short_term', 'stats_medium_term',
    'stats_long_term', 'song_league_playlists', 'shared_playlists'
  )),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  trigger_type text not null default 'scheduled' check (trigger_type in ('scheduled', 'manual')),
  requested_by uuid references public.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  details jsonb not null default '{}'::jsonb
);

create unique index if not exists sync_job_runs_one_active_task_idx
  on public.sync_job_runs(user_id, task_key)
  where status in ('queued', 'running');
create index if not exists sync_job_runs_recent_idx
  on public.sync_job_runs(requested_at desc);

alter table public.song_leagues
  add column if not exists is_demo boolean not null default false;

create table if not exists public.song_league_demo_bots (
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  personality text not null,
  snapshot_id uuid references public.stats_snapshots(id) on delete set null,
  primary key (league_id, user_id),
  foreign key (league_id, user_id)
    references public.song_league_members(league_id, user_id) on delete cascade
);

alter table public.app_admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.sync_user_settings enable row level security;
alter table public.sync_task_state enable row level security;
alter table public.sync_job_runs enable row level security;
alter table public.song_league_demo_bots enable row level security;

create or replace function private.is_app_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1 from public.app_admins admin where admin.user_id = p_user_id
  );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_app_admin(auth.uid());
$$;

create or replace function public.get_public_site_settings()
returns table (announcement text, allow_song_league_creation boolean)
language sql
stable
security definer
set search_path = public
as $$
  select settings.announcement, settings.allow_song_league_creation
  from public.site_settings settings
  where settings.singleton;
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  spotify_id text,
  display_name text,
  profile_pic_url text,
  backup_active boolean,
  has_refresh_token boolean,
  enabled boolean,
  timezone text,
  history_enabled boolean,
  history_interval_minutes integer,
  short_term_enabled boolean,
  short_term_interval_hours integer,
  medium_term_enabled boolean,
  medium_term_interval_hours integer,
  long_term_enabled boolean,
  long_term_interval_hours integer,
  song_league_playlists_enabled boolean,
  song_league_playlist_interval_minutes integer,
  shared_playlists_enabled boolean,
  shared_playlist_interval_minutes integer,
  last_success_at timestamptz,
  last_error text
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  return query
  select
    profile.id,
    profile.spotify_id::text,
    coalesce(profile.display_name, 'Spotify user')::text,
    coalesce(profile.profile_pic_url, '')::text,
    profile.backup_active,
    profile.spotify_refresh_token is not null,
    coalesce(settings.enabled, false),
    coalesce(settings.timezone, 'Europe/Vienna')::text,
    coalesce(settings.history_enabled, true),
    coalesce(settings.history_interval_minutes, 60),
    coalesce(settings.short_term_enabled, true),
    coalesce(settings.short_term_interval_hours, 24),
    coalesce(settings.medium_term_enabled, true),
    coalesce(settings.medium_term_interval_hours, 168),
    coalesce(settings.long_term_enabled, true),
    coalesce(settings.long_term_interval_hours, 168),
    coalesce(settings.song_league_playlists_enabled, true),
    coalesce(settings.song_league_playlist_interval_minutes, 60),
    coalesce(settings.shared_playlists_enabled, true),
    coalesce(settings.shared_playlist_interval_minutes, 60),
    state.last_success_at,
    state.last_error
  from public.users profile
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

create or replace function public.admin_update_sync_user(
  p_user_id uuid,
  p_enabled boolean,
  p_timezone text,
  p_history_enabled boolean,
  p_history_interval_minutes integer,
  p_short_term_enabled boolean,
  p_short_term_interval_hours integer,
  p_medium_term_enabled boolean,
  p_medium_term_interval_hours integer,
  p_long_term_enabled boolean,
  p_long_term_interval_hours integer,
  p_song_league_playlists_enabled boolean,
  p_song_league_playlist_interval_minutes integer,
  p_shared_playlists_enabled boolean,
  p_shared_playlist_interval_minutes integer
) returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'The synchronization timezone is invalid.';
  end if;
  insert into public.sync_user_settings(
    user_id, enabled, timezone,
    history_enabled, history_interval_minutes,
    short_term_enabled, short_term_interval_hours,
    medium_term_enabled, medium_term_interval_hours,
    long_term_enabled, long_term_interval_hours,
    song_league_playlists_enabled, song_league_playlist_interval_minutes,
    shared_playlists_enabled, shared_playlist_interval_minutes,
    updated_at, updated_by
  ) values (
    p_user_id, p_enabled, p_timezone,
    p_history_enabled, p_history_interval_minutes,
    p_short_term_enabled, p_short_term_interval_hours,
    p_medium_term_enabled, p_medium_term_interval_hours,
    p_long_term_enabled, p_long_term_interval_hours,
    p_song_league_playlists_enabled, p_song_league_playlist_interval_minutes,
    p_shared_playlists_enabled, p_shared_playlist_interval_minutes,
    now(), auth.uid()
  ) on conflict (user_id) do update set
    enabled = excluded.enabled,
    timezone = excluded.timezone,
    history_enabled = excluded.history_enabled,
    history_interval_minutes = excluded.history_interval_minutes,
    short_term_enabled = excluded.short_term_enabled,
    short_term_interval_hours = excluded.short_term_interval_hours,
    medium_term_enabled = excluded.medium_term_enabled,
    medium_term_interval_hours = excluded.medium_term_interval_hours,
    long_term_enabled = excluded.long_term_enabled,
    long_term_interval_hours = excluded.long_term_interval_hours,
    song_league_playlists_enabled = excluded.song_league_playlists_enabled,
    song_league_playlist_interval_minutes = excluded.song_league_playlist_interval_minutes,
    shared_playlists_enabled = excluded.shared_playlists_enabled,
    shared_playlist_interval_minutes = excluded.shared_playlist_interval_minutes,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

create or replace function public.admin_update_site_settings(
  p_announcement text,
  p_allow_song_league_creation boolean
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  update public.site_settings set
    announcement = left(trim(coalesce(p_announcement, '')), 500),
    allow_song_league_creation = p_allow_song_league_creation,
    updated_at = now(),
    updated_by = auth.uid()
  where singleton;
end;
$$;

create or replace function public.admin_enqueue_sync(
  p_user_id uuid,
  p_task_keys text[]
) returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_inserted integer;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception 'User not found.'; end if;
  if exists (
    select 1 from unnest(coalesce(p_task_keys, array[]::text[])) task_key
    where task_key not in ('listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term', 'song_league_playlists', 'shared_playlists')
  ) then raise exception 'Unknown synchronization task.'; end if;

  insert into public.sync_job_runs(user_id, task_key, trigger_type, requested_by)
  select p_user_id, task_key, 'manual', auth.uid()
  from unnest(coalesce(p_task_keys, array[]::text[])) task_key
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.admin_list_sync_runs(p_limit integer default 50)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  task_key text,
  status text,
  trigger_type text,
  requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  return query
  select run.id, run.user_id, coalesce(profile.display_name, profile.spotify_id)::text,
    run.task_key, run.status, run.trigger_type, run.requested_at,
    run.started_at, run.finished_at, run.error, run.details
  from public.sync_job_runs run
  join public.users profile on profile.id = run.user_id
  order by run.requested_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

create or replace function private.enforce_song_league_creation_setting()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not new.is_demo
    and not private.is_app_admin(new.owner_user_id)
    and not coalesce((select allow_song_league_creation from public.site_settings where singleton), true)
  then
    raise exception 'New Song Leagues are temporarily disabled.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_song_league_creation_setting on public.song_leagues;
create trigger enforce_song_league_creation_setting
before insert on public.song_leagues
for each row execute function private.enforce_song_league_creation_setting();

create or replace function public.admin_create_demo_league(
  p_name text default 'Admin Demo League',
  p_timezone text default 'Europe/Vienna'
) returns uuid
language plpgsql
security definer
set search_path = public, private, extensions, pg_catalog
as $$
declare
  v_owner public.users%rowtype;
  v_league_id uuid;
  v_round_id uuid;
  v_bot_id uuid;
  v_bot_ids uuid[] := array[]::uuid[];
  v_bot_names text[] := array['Beat Bot', 'Indie Bot', 'Wildcard Bot'];
  v_personalities text[] := array['crowd-pleaser', 'deep-cuts', 'wildcard'];
  v_snapshot_id uuid;
  v_track record;
  v_recommendation_id uuid;
  v_index integer := 0;
  v_rank integer;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Invalid timezone.'; end if;
  select * into v_owner from public.users where id = auth.uid();
  if not found then raise exception 'Administrator profile not found.'; end if;
  if (select count(*) from public.tracks where not is_local) < 4 then
    raise exception 'At least four Spotify catalog tracks are needed before creating a demo.';
  end if;

  insert into public.song_leagues(
    owner_user_id, name, timezone, owner_display_name, owner_image_url, is_demo
  ) values (
    auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Admin Demo League'), 80), p_timezone,
    coalesce(v_owner.display_name, 'Administrator'), coalesce(v_owner.profile_pic_url, ''), true
  ) returning id into v_league_id;

  insert into public.song_league_members(league_id, user_id, role, display_name, image_url)
  values (v_league_id, auth.uid(), 'owner', coalesce(v_owner.display_name, 'Administrator'), coalesce(v_owner.profile_pic_url, ''));

  insert into public.song_league_rounds(
    league_id, starts_at, submission_ends_at, scoring_starts_at, scoring_ends_at
  ) values (
    v_league_id, now() - interval '1 minute', now() + interval '1 day',
    now() + interval '1 day', now() + interval '29 days'
  ) returning id into v_round_id;

  for v_index in 1..3 loop
    v_bot_id := gen_random_uuid();
    v_bot_ids := array_append(v_bot_ids, v_bot_id);
    insert into public.users(id, spotify_id, display_name, profile_pic_url, backup_active)
    values (v_bot_id, 'analytify_demo_bot_' || replace(v_bot_id::text, '-', ''), v_bot_names[v_index], '', false);
    insert into public.song_league_members(league_id, user_id, role, display_name, image_url, joined_at)
    values (v_league_id, v_bot_id, 'member', v_bot_names[v_index], '', now() + make_interval(secs => v_index));
    insert into public.stats_snapshots(user_id, range, snapshot_date, explicit_percentage, genre_diversity)
    values (v_bot_id, 'short_term', current_date, 0, 8)
    returning id into v_snapshot_id;
    insert into public.song_league_demo_bots(league_id, user_id, personality, snapshot_id)
    values (v_league_id, v_bot_id, v_personalities[v_index], v_snapshot_id);
  end loop;

  v_index := 0;
  for v_track in
    select track.id, track.name, track.isrc, coalesce(track.spotify_url, '') as spotify_url,
      coalesce(album.name, '') as album_name, coalesce(album.image_url, '') as image_url,
      coalesce((
        select string_agg(artist.name, ', ' order by relation.artist_rank)
        from public.track_artists relation
        join public.artists artist on artist.id = relation.artist_id
        where relation.track_id = track.id
      ), 'Unknown artist') as artist_names
    from public.tracks track
    left join public.albums album on album.id = track.album_id
    where not track.is_local
    order by track.last_updated desc, track.id
    limit 3
  loop
    v_index := v_index + 1;
    insert into public.song_league_recommendations(
      league_id, round_id, recommender_user_id, track_id, recording_key, isrc,
      track_name, artist_names, album_name, image_url, spotify_url,
      submitted_at, scoring_starts_at, scoring_ends_at
    ) values (
      v_league_id, v_round_id, v_bot_ids[v_index], v_track.id,
      case when nullif(trim(v_track.isrc), '') is not null then 'isrc:' || upper(trim(v_track.isrc)) else 'track:' || v_track.id end,
      v_track.isrc, v_track.name, v_track.artist_names, v_track.album_name,
      v_track.image_url, v_track.spotify_url, now(), now() - interval '1 day', now() + interval '28 days'
    ) returning id into v_recommendation_id;

    insert into public.song_league_recommendation_audience(recommendation_id, league_id, listener_user_id)
    select v_recommendation_id, v_league_id, member.user_id
    from public.song_league_members member
    where member.league_id = v_league_id and member.user_id <> v_bot_ids[v_index];
  end loop;

  insert into public.song_league_score_events(
    league_id, recommendation_id, listener_user_id, snapshot_id, snapshot_date,
    matched_track_id, matched_rank, list_size, points
  )
  select v_league_id, recommendation.id, bot.user_id, bot.snapshot_id, current_date,
    recommendation.track_id,
    10 + mod(abs(hashtextextended(recommendation.id::text || bot.user_id::text, 0)), 55)::integer,
    100,
    91 - mod(abs(hashtextextended(recommendation.id::text || bot.user_id::text, 0)), 55)::integer
  from public.song_league_recommendations recommendation
  cross join public.song_league_demo_bots bot
  where recommendation.league_id = v_league_id
    and bot.league_id = v_league_id
    and bot.user_id <> recommendation.recommender_user_id;

  return v_league_id;
end;
$$;

create or replace function public.submit_song_league_demo_recommendation(
  p_league_id uuid,
  p_track_id text
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_round_id uuid;
  v_track record;
  v_recommendation_id uuid;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if not exists (
    select 1 from public.song_leagues
    where id = p_league_id and owner_user_id = auth.uid() and is_demo and closed_at is null
  ) then raise exception 'The demo league was not found.'; end if;
  select id into v_round_id from public.song_league_rounds
  where league_id = p_league_id order by starts_at desc limit 1;
  if exists (
    select 1 from public.song_league_recommendations
    where round_id = v_round_id and recommender_user_id = auth.uid()
  ) then raise exception 'You already made your demo pick.'; end if;

  select track.id, track.name, track.isrc, coalesce(track.spotify_url, '') as spotify_url,
    coalesce(album.name, '') as album_name, coalesce(album.image_url, '') as image_url,
    coalesce((
      select string_agg(artist.name, ', ' order by relation.artist_rank)
      from public.track_artists relation join public.artists artist on artist.id = relation.artist_id
      where relation.track_id = track.id
    ), 'Unknown artist') as artist_names
  into v_track
  from public.tracks track left join public.albums album on album.id = track.album_id
  where track.id = p_track_id and not track.is_local;
  if not found then raise exception 'Choose a playable Spotify catalog track.'; end if;
  if exists (
    select 1 from public.song_league_recommendations
    where league_id = p_league_id
      and (track_id = p_track_id or (v_track.isrc is not null and upper(isrc) = upper(v_track.isrc)))
  ) then raise exception 'That recording is already active in this demo.'; end if;

  insert into public.song_league_recommendations(
    league_id, round_id, recommender_user_id, track_id, recording_key, isrc,
    track_name, artist_names, album_name, image_url, spotify_url,
    scoring_starts_at, scoring_ends_at
  ) values (
    p_league_id, v_round_id, auth.uid(), v_track.id,
    case when nullif(trim(v_track.isrc), '') is not null then 'isrc:' || upper(trim(v_track.isrc)) else 'track:' || v_track.id end,
    v_track.isrc, v_track.name, v_track.artist_names, v_track.album_name,
    v_track.image_url, v_track.spotify_url, now() - interval '1 day', now() + interval '28 days'
  ) returning id into v_recommendation_id;

  insert into public.song_league_recommendation_audience(recommendation_id, league_id, listener_user_id)
  select v_recommendation_id, p_league_id, bot.user_id
  from public.song_league_demo_bots bot where bot.league_id = p_league_id;

  insert into public.song_league_score_events(
    league_id, recommendation_id, listener_user_id, snapshot_id, snapshot_date,
    matched_track_id, matched_rank, list_size, points
  )
  select p_league_id, v_recommendation_id, bot.user_id, bot.snapshot_id, current_date,
    p_track_id,
    5 + mod(abs(hashtextextended(v_recommendation_id::text || bot.user_id::text, 0)), 60)::integer,
    100,
    96 - mod(abs(hashtextextended(v_recommendation_id::text || bot.user_id::text, 0)), 60)::integer
  from public.song_league_demo_bots bot where bot.league_id = p_league_id;

  return v_recommendation_id;
end;
$$;

create or replace function public.delete_song_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demo_bot_ids uuid[];
begin
  select array_agg(bot.user_id) into v_demo_bot_ids
  from public.song_league_demo_bots bot
  join public.song_leagues league on league.id = bot.league_id
  where bot.league_id = p_league_id and league.owner_user_id = auth.uid();

  delete from public.song_leagues
  where id = p_league_id and owner_user_id = auth.uid();
  if not found then raise exception 'The league was not found or is not owned by this user.'; end if;

  if coalesce(array_length(v_demo_bot_ids, 1), 0) > 0 then
    delete from public.users
    where id = any(v_demo_bot_ids) and spotify_id like 'analytify_demo_bot_%';
  end if;
end;
$$;

revoke all on function private.is_app_admin(uuid) from public;
revoke all on function private.initialize_sync_user_settings() from public;
revoke all on function private.enforce_song_league_creation_setting() from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.get_public_site_settings() from public;
revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_update_sync_user(uuid, boolean, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer, boolean, integer, boolean, integer) from public;
revoke all on function public.admin_update_site_settings(text, boolean) from public;
revoke all on function public.admin_enqueue_sync(uuid, text[]) from public;
revoke all on function public.admin_list_sync_runs(integer) from public;
revoke all on function public.admin_create_demo_league(text, text) from public;
revoke all on function public.submit_song_league_demo_recommendation(uuid, text) from public;
revoke all on function public.delete_song_league(uuid) from public;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.get_public_site_settings() to anon, authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_sync_user(uuid, boolean, text, boolean, integer, boolean, integer, boolean, integer, boolean, integer, boolean, integer, boolean, integer) to authenticated;
grant execute on function public.admin_update_site_settings(text, boolean) to authenticated;
grant execute on function public.admin_enqueue_sync(uuid, text[]) to authenticated;
grant execute on function public.admin_list_sync_runs(integer) to authenticated;
grant execute on function public.admin_create_demo_league(text, text) to authenticated;
grant execute on function public.submit_song_league_demo_recommendation(uuid, text) to authenticated;
grant execute on function public.delete_song_league(uuid) to authenticated;

grant all on public.app_admins to service_role;
grant all on public.site_settings to service_role;
grant all on public.sync_user_settings to service_role;
grant all on public.sync_task_state to service_role;
grant all on public.sync_job_runs to service_role;
grant all on public.song_league_demo_bots to service_role;
