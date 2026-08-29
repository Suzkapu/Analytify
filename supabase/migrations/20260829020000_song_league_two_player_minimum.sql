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
  if now() >= v_round.submission_ends_at then raise exception 'Friday submissions are closed.'; end if;

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
      and recommendation.scoring_ends_at > v_round.scoring_starts_at
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
    v_round.scoring_starts_at,
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
