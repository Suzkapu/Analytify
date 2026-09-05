-- Advisory locking functions for Song League Spotify playlist synchronization.
-- Serializes background and user-triggered playlist updates per league to prevent
-- concurrent race conditions, duplicate playlist creations, and conflicting updates.

create or replace function public.try_lock_song_league_playlist_sync(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  return pg_try_advisory_lock(hashtext('song_league_playlist_sync:' || p_league_id::text));
end;
$$;

create or replace function public.unlock_song_league_playlist_sync(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  return pg_advisory_unlock(hashtext('song_league_playlist_sync:' || p_league_id::text));
end;
$$;

revoke all on function public.try_lock_song_league_playlist_sync(uuid) from public, anon, authenticated;
grant execute on function public.try_lock_song_league_playlist_sync(uuid) to service_role;

revoke all on function public.unlock_song_league_playlist_sync(uuid) from public, anon, authenticated;
grant execute on function public.unlock_song_league_playlist_sync(uuid) to service_role;
