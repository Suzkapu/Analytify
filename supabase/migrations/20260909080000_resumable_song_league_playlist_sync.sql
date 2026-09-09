-- A durable, deterministic operation marker lets the Edge Function recover a
-- Spotify playlist when Spotify completed creation but its HTTP response (or
-- the following database completion) was lost.
alter table public.song_league_playlists
  add column operation_marker text;

update public.song_league_playlists
set operation_marker = encode(extensions.digest(
  convert_to('song-league-playlist:' || league_id::text || ':' || user_id::text, 'UTF8'),
  'sha256'
), 'hex')
where operation_marker is null;

alter table public.song_league_playlists
  add constraint song_league_playlists_operation_marker_format
    check (operation_marker is null or operation_marker ~ '^[0-9a-f]{64}$');

create unique index song_league_playlists_operation_marker_key
  on public.song_league_playlists(operation_marker)
  where operation_marker is not null;

create function public.reserve_song_league_playlist_sync(
  p_league_id uuid,
  p_user_id uuid,
  p_expected_source_revision bigint,
  p_expected_applied_revision bigint,
  p_expected_round_id uuid,
  p_lease_token uuid
) returns table (
  operation_marker text,
  spotify_playlist_id text,
  spotify_playlist_url text,
  last_synced_revision bigint,
  last_synced_round_id uuid,
  last_error text
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_current_revision bigint;
  v_current_round_id uuid;
  v_marker text := encode(digest(
    convert_to('song-league-playlist:' || p_league_id::text || ':' || p_user_id::text, 'UTF8'),
    'sha256'
  ), 'hex');
begin
  if auth.role() <> 'service_role' or p_lease_token is null then return; end if;
  if not exists (
    select 1 from private.song_league_playlist_sync_leases
    where league_id = p_league_id
      and lease_token = p_lease_token
      and lease_expires_at > now()
  ) then return; end if;

  select league.playlist_revision, round.id
  into v_current_revision, v_current_round_id
  from public.song_leagues league
  left join public.song_league_rounds round
    on round.league_id = league.id
   and round.starts_at = private.song_league_friday_start(league.timezone, now())
  where league.id = p_league_id and league.closed_at is null
  for update of league;
  if not found
    or v_current_revision <> p_expected_source_revision
    or v_current_round_id is distinct from p_expected_round_id
    or not exists (
      select 1 from public.song_league_members member
      where member.league_id = p_league_id
        and member.user_id = p_user_id
        and member.left_at is null
    ) then return; end if;

  insert into public.song_league_playlists(
    league_id, user_id, operation_marker, spotify_playlist_id,
    spotify_playlist_url, last_synced_revision
  ) values (
    p_league_id, p_user_id, v_marker, null, '', 0
  ) on conflict (league_id, user_id) do nothing;

  return query
    select destination.operation_marker,
      destination.spotify_playlist_id,
      destination.spotify_playlist_url,
      destination.last_synced_revision,
      destination.last_synced_round_id,
      destination.last_error
    from public.song_league_playlists destination
    where destination.league_id = p_league_id
      and destination.user_id = p_user_id
      and destination.operation_marker = v_marker
      and destination.last_synced_revision = p_expected_applied_revision;
end;
$$;

create function public.record_song_league_playlist_sync_failure(
  p_league_id uuid,
  p_user_id uuid,
  p_expected_applied_revision bigint,
  p_lease_token uuid,
  p_last_error text
) returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_safe_error text := case
    when p_last_error = 'Reconnect Spotify so Analytify can maintain this playlist.'
      then p_last_error
    else 'This playlist could not be updated. Please try again later.'
  end;
begin
  if auth.role() <> 'service_role' or p_lease_token is null then return false; end if;
  if not exists (
    select 1 from private.song_league_playlist_sync_leases
    where league_id = p_league_id
      and lease_token = p_lease_token
      and lease_expires_at > now()
  ) then return false; end if;

  update public.song_league_playlists
  set last_error = v_safe_error,
      updated_at = now()
  where league_id = p_league_id
    and user_id = p_user_id
    and last_synced_revision = p_expected_applied_revision;
  return found;
end;
$$;

revoke all on function public.reserve_song_league_playlist_sync(uuid, uuid, bigint, bigint, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_song_league_playlist_sync_failure(uuid, uuid, bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_song_league_playlist_sync(uuid, uuid, bigint, bigint, uuid, uuid)
  to service_role;
grant execute on function public.record_song_league_playlist_sync_failure(uuid, uuid, bigint, uuid, text)
  to service_role;

comment on column public.song_league_playlists.operation_marker is
  'Stable non-secret marker embedded in the owned Spotify playlist description for retry discovery.';
comment on function public.reserve_song_league_playlist_sync(uuid, uuid, bigint, bigint, uuid, uuid) is
  'Lease- and revision-checked reservation that commits before Spotify playlist side effects.';

notify pgrst, 'reload schema';
