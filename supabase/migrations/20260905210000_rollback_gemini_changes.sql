-- Compensate database changes from the rolled-back Gemini commits.
-- The deployment table only contains release metadata, not user data.

alter table if exists public.artists
  drop constraint if exists chk_artists_spotify_url;
alter table if exists public.albums
  drop constraint if exists chk_albums_spotify_url;
alter table if exists public.tracks
  drop constraint if exists chk_tracks_spotify_url;
alter table if exists public.song_league_recommendations
  drop constraint if exists chk_song_league_recommendations_spotify_url;
alter table if exists public.song_league_playlists
  drop constraint if exists chk_song_league_playlists_spotify_playlist_url;
alter table if exists public.playlist_share_downloads
  drop constraint if exists chk_playlist_share_downloads_spotify_playlist_url;

drop table if exists public.deployment_records;
