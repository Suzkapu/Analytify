-- Weekly picks remain Friday cohorts, but submissions stay open until next Friday.
-- Existing recommendation scoring dates and permanent score events are unchanged.
do $$
declare constraint_row record;
begin
  for constraint_row in select conname from pg_constraint
    where conrelid = 'public.song_league_rounds'::regclass
      and pg_get_constraintdef(oid) like '%submission_ends_at = scoring_starts_at%'
  loop
    execute format('alter table public.song_league_rounds drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

-- A round's existing baseline is immutable once recommendations begin, but a
-- member whose same-day snapshot finishes afterward must still be admitted.
create or replace function private.ensure_song_league_round(
  p_league_id uuid,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_league public.song_leagues%rowtype;
  v_local_now timestamp;
  v_today date;
  v_start timestamptz;
  v_submission_end timestamptz;
  v_scoring_end timestamptz;
  v_round_id uuid;
  v_roster_size integer;
  v_has_recommendations boolean;
begin
  select * into v_league from public.song_leagues
  where id = p_league_id and closed_at is null for update;
  if not found or not private.is_song_league_member(p_league_id) then
    raise exception 'The active Song League was not found.';
  end if;

  perform private.enable_song_league_sync_for_user(auth.uid());
  v_local_now := p_now at time zone v_league.timezone;

  v_today := v_local_now::date;
  v_start := private.song_league_friday_start(v_league.timezone, p_now);
  v_submission_end := (((v_start at time zone v_league.timezone)::date + 7)::timestamp at time zone v_league.timezone);
  v_scoring_end := (((v_start at time zone v_league.timezone)::date + 29)::timestamp at time zone v_league.timezone);

  insert into public.song_league_rounds(
    league_id, starts_at, submission_ends_at, scoring_starts_at, scoring_ends_at
  ) values (p_league_id, v_start, v_submission_end, (((v_start at time zone v_league.timezone)::date + 1)::timestamp at time zone v_league.timezone), v_scoring_end)
  on conflict (league_id, starts_at) do update
    set submission_ends_at = excluded.submission_ends_at;

  select id into v_round_id from public.song_league_rounds
  where league_id = p_league_id and starts_at = v_start;
  select exists(select 1 from public.song_league_recommendations where round_id = v_round_id)
    into v_has_recommendations;

  if not v_has_recommendations then
    delete from public.song_league_round_members where round_id = v_round_id;
  end if;

  -- Missing members are inserted even after the first pick. The conflict
  -- update is allowed only before the first pick, preserving frozen baselines.
  insert into public.song_league_round_members(
    round_id, league_id, user_id, baseline_snapshot_id
  )
  select v_round_id, p_league_id, member.user_id, snapshot.id
  from public.song_league_members member
  join public.users profile
    on profile.id = member.user_id and profile.backup_active = true
  join lateral (
    select candidate.id
    from public.stats_snapshots candidate
    where candidate.user_id = member.user_id
      and candidate.range = 'short_term'
      and candidate.snapshot_date = v_today
      and exists (select 1 from public.stats_snapshot_tracks item
        where item.snapshot_id = candidate.id)
    order by candidate.created_at desc
    limit 1
  ) snapshot on true
  where member.league_id = p_league_id and member.left_at is null
  on conflict (round_id, user_id) do update
    set baseline_snapshot_id = excluded.baseline_snapshot_id
    where not v_has_recommendations;

  select count(*)::integer into v_roster_size
  from public.song_league_round_members where round_id = v_round_id;
  if v_roster_size < 2 then
    raise exception 'At least two league members need today''s fresh short-term Top Songs.';
  end if;
  if not exists (select 1 from public.song_league_round_members
    where round_id = v_round_id and user_id = auth.uid()) then
    raise exception 'Your short-term Top Songs are not fresh for today yet.';
  end if;
  return v_round_id;
end;
$$;

-- A league needs one recommender and at least one opponent. The previous
-- threshold required two opponents and unintentionally made three members the
-- minimum. The strict-majority rule remains unchanged: with one opponent, the
-- selected recording must be absent from that opponent's fresh Top Songs.
create or replace function public.submit_song_league_recommendation(
  p_league_id uuid,
  p_track_id text
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_round public.song_league_rounds%rowtype;
  v_round_id uuid;
  v_scoring_start timestamptz;
  v_timezone text;
  v_track public.tracks%rowtype;
  v_recording_key text;
  v_artist_names text;
  v_album_name text;
  v_image_url text;
  v_opponent_count integer;
  v_absent_count integer;
  v_best_existing_rank integer;
  v_recommendation_id uuid;
begin
  v_round_id := private.ensure_song_league_round(p_league_id, now());
  select * into v_round from public.song_league_rounds where id = v_round_id;
  select timezone into v_timezone from public.song_leagues where id = p_league_id;
  v_scoring_start := (((now() at time zone v_timezone)::date + 1)::timestamp at time zone v_timezone);
  if exists (select 1 from public.song_league_recommendations
    where round_id = v_round_id and recommender_user_id = auth.uid()) then
    raise exception 'You already picked this week. Your next pick opens Friday.';
  end if;

  select * into v_track from public.tracks where id = p_track_id;
  if not found or v_track.is_local then raise exception 'Choose a playable Spotify catalog track.'; end if;

  v_recording_key := case
    when nullif(trim(v_track.isrc), '') is not null then 'isrc:' || upper(trim(v_track.isrc))
    else 'track:' || v_track.id
  end;

  perform pg_advisory_xact_lock(hashtextextended(p_league_id::text || ':' || v_recording_key, 0));

  if exists (
    select 1
    from public.song_league_recommendations recommendation
    where recommendation.league_id = p_league_id
      and recommendation.recording_key = v_recording_key
      and recommendation.scoring_ends_at > v_scoring_start
  ) then
    raise exception 'That recording is already active in this league.';
  end if;

  with opponent_ranks as (
    select
      roster.user_id,
      min(item.rank) filter (
        where candidate.id = v_track.id
          or (
            nullif(v_track.isrc, '') is not null
            and upper(nullif(candidate.isrc, '')) = upper(v_track.isrc)
          )
      ) as matched_rank
    from public.song_league_round_members roster
    left join public.stats_snapshot_tracks item on item.snapshot_id = roster.baseline_snapshot_id
    left join public.tracks candidate on candidate.id = item.track_id
    where roster.round_id = v_round_id and roster.user_id <> auth.uid()
    group by roster.user_id
  )
  select
    count(*)::integer,
    count(*) filter (where matched_rank is null)::integer,
    min(matched_rank)::integer
  into v_opponent_count, v_absent_count, v_best_existing_rank
  from opponent_ranks;

  if v_opponent_count < 1 then
    raise exception 'At least one opponent needs fresh Top Songs for discovery validation.';
  end if;
  if v_absent_count * 2 <= v_opponent_count then
    raise exception 'Choose a song that is new to a strict majority of the league.';
  end if;
  if v_best_existing_rank is not null and v_best_existing_rank <= 20 then
    raise exception 'That song is already a Top 20 favorite for a league member.';
  end if;

  select coalesce(string_agg(artist.name, ', ' order by relation.artist_rank), 'Unknown artist')
  into v_artist_names
  from public.track_artists relation
  join public.artists artist on artist.id = relation.artist_id
  where relation.track_id = v_track.id;

  select coalesce(album.name, ''), coalesce(album.image_url, '')
  into v_album_name, v_image_url
  from public.albums album
  where album.id = v_track.album_id;

  insert into public.song_league_recommendations(
    league_id,
    round_id,
    recommender_user_id,
    track_id,
    recording_key,
    isrc,
    track_name,
    artist_names,
    album_name,
    image_url,
    spotify_url,
    scoring_starts_at,
    scoring_ends_at
  ) values (
    p_league_id,
    v_round_id,
    auth.uid(),
    v_track.id,
    v_recording_key,
    v_track.isrc,
    v_track.name,
    v_artist_names,
    v_album_name,
    v_image_url,
    coalesce(v_track.spotify_url, ''),
    v_scoring_start,
    v_round.scoring_ends_at
  ) returning id into v_recommendation_id;

  insert into public.song_league_recommendation_audience(
    recommendation_id, league_id, listener_user_id
  )
  select v_recommendation_id, p_league_id, roster.user_id
  from public.song_league_round_members roster
  where roster.round_id = v_round_id and roster.user_id <> auth.uid();

  return v_recommendation_id;
end;
$$;
create or replace function private.bump_song_league_playlist_revision()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog
as $$
begin
  update public.song_leagues set playlist_revision = playlist_revision + 1
    where id = new.league_id;
  -- Durable fallback even if the picker closes the browser before the Edge call.
  insert into public.sync_task_state(user_id, task_key, next_run_at, updated_at)
  select playlist.user_id, 'song_league_playlists', now(), now()
  from public.song_league_playlists playlist
  join public.song_league_members member
    on member.league_id = playlist.league_id and member.user_id = playlist.user_id
    and member.left_at is null
  where playlist.league_id = new.league_id
  on conflict (user_id, task_key) do update
    set next_run_at = excluded.next_run_at, updated_at = excluded.updated_at;
  return new;
end;
$$;

notify pgrst, 'reload schema';
