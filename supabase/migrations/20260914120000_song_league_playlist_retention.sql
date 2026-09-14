-- Weekly Picks follows the same four-round lifetime as Song League scoring.
-- Persisting the computed Friday window also makes a quiet week observable:
-- the worker must refresh once per new window even when no recommendation
-- incremented playlist_revision.
alter table public.song_league_playlists
  add column if not exists last_synced_window_start timestamptz;

drop function if exists public.get_song_league_weekly_playlist_payload(uuid, timestamptz);
create function public.get_song_league_weekly_playlist_payload(
  p_league_id uuid,
  p_now timestamptz default now()
) returns table (
  league_id uuid,
  league_name text,
  timezone text,
  playlist_revision bigint,
  round_id uuid,
  playlist_window_start timestamptz,
  track_uris text[]
)
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select
    league.id,
    league.name,
    league.timezone,
    league.playlist_revision,
    current_round.id,
    playlist_window.starts_at,
    coalesce(
      array_agg('spotify:track:' || active_track.track_id
        order by active_track.latest_submission desc, active_track.track_id)
        filter (where active_track.track_id is not null),
      array[]::text[]
    )
  from public.song_leagues league
  cross join lateral (
    select private.song_league_friday_start(league.timezone, p_now) as starts_at
  ) playlist_window
  left join public.song_league_rounds current_round
    on current_round.league_id = league.id
   and current_round.starts_at = playlist_window.starts_at
  left join lateral (
    select recommendation.track_id, max(recommendation.submitted_at) as latest_submission
    from public.song_league_recommendations recommendation
    where recommendation.league_id = league.id
      and recommendation.submitted_at <= p_now
      and recommendation.scoring_ends_at > (
        ((playlist_window.starts_at at time zone league.timezone)::date + 1)::timestamp
          at time zone league.timezone
      )
    group by recommendation.track_id
  ) active_track on true
  where league.id = p_league_id
    and league.closed_at is null
  group by league.id, league.name, league.timezone, league.playlist_revision,
    current_round.id, playlist_window.starts_at;
$$;

revoke all on function public.get_song_league_weekly_playlist_payload(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_song_league_weekly_playlist_payload(uuid, timestamptz)
  to service_role;

create or replace function public.complete_song_league_playlist_sync(
  p_league_id uuid,
  p_user_id uuid,
  p_expected_source_revision bigint,
  p_expected_applied_revision bigint,
  p_expected_round_id uuid,
  p_lease_token uuid,
  p_spotify_playlist_id text,
  p_spotify_playlist_url text
) returns boolean
language plpgsql security definer set search_path = public, private as $$
declare v_current_revision bigint;
declare v_current_round_id uuid;
declare v_window_start timestamptz;
begin
  if auth.role() <> 'service_role' then return false; end if;
  if nullif(trim(p_spotify_playlist_id), '') is null then raise exception 'A Spotify playlist ID is required.'; end if;
  select league.playlist_revision, round.id,
    private.song_league_friday_start(league.timezone, now())
  into v_current_revision, v_current_round_id, v_window_start
  from public.song_leagues league
  left join public.song_league_rounds round
    on round.league_id = league.id
   and round.starts_at = private.song_league_friday_start(league.timezone, now())
  where league.id = p_league_id and league.closed_at is null
  for update of league;
  if not found or v_current_revision <> p_expected_source_revision
    or v_current_round_id is distinct from p_expected_round_id then return false; end if;
  if not exists (
    select 1 from private.song_league_playlist_sync_leases
    where league_id = p_league_id and lease_token = p_lease_token and lease_expires_at > now()
  ) then return false; end if;
  if p_expected_applied_revision = 0 and not exists (
    select 1 from public.song_league_playlists where league_id = p_league_id and user_id = p_user_id
  ) then
    insert into public.song_league_playlists(
      league_id, user_id, spotify_playlist_id, spotify_playlist_url,
      last_synced_revision, last_synced_round_id, last_synced_window_start,
      last_synced_at, last_error, updated_at
    ) values (
      p_league_id, p_user_id, trim(p_spotify_playlist_id), coalesce(p_spotify_playlist_url, ''),
      p_expected_source_revision, p_expected_round_id, v_window_start, now(), null, now()
    );
    return true;
  end if;
  update public.song_league_playlists
  set spotify_playlist_id = trim(p_spotify_playlist_id),
      spotify_playlist_url = coalesce(p_spotify_playlist_url, ''),
      last_synced_revision = p_expected_source_revision,
      last_synced_round_id = p_expected_round_id,
      last_synced_window_start = v_window_start,
      last_synced_at = now(),
      last_error = null,
      updated_at = now()
  where league_id = p_league_id and user_id = p_user_id
    and last_synced_revision = p_expected_applied_revision;
  return found;
end;
$$;

notify pgrst, 'reload schema';
