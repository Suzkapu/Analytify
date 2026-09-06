create or replace function private.is_valid_spotify_url(p_url text, p_entity_type text)
returns boolean language sql immutable security definer set search_path = pg_catalog
as $$
  select p_entity_type in ('track', 'artist', 'album', 'playlist', 'user', 'collection', 'show', 'episode')
    and p_url ~ ('^https://open[.]spotify[.]com/(intl-[A-Za-z]{2}(-[A-Za-z]{2})?/)?'
      || p_entity_type || '/[A-Za-z0-9_-]{1,100}/?([?][^[:space:]#]*)?$');
$$;
revoke all on function private.is_valid_spotify_url(text, text) from public, anon, authenticated;

update public.artists set spotify_url = null
where spotify_url is not null and not private.is_valid_spotify_url(spotify_url, 'artist');
update public.albums set spotify_url = null
where spotify_url is not null and not private.is_valid_spotify_url(spotify_url, 'album');
update public.tracks set spotify_url = null
where spotify_url is not null and not private.is_valid_spotify_url(spotify_url, 'track');
update public.song_league_recommendations set spotify_url = ''
where spotify_url <> '' and not private.is_valid_spotify_url(spotify_url, 'track');
update public.song_league_playlists set spotify_playlist_url = ''
where coalesce(spotify_playlist_url, '') <> ''
  and not private.is_valid_spotify_url(spotify_playlist_url, 'playlist');
update public.playlist_share_downloads set spotify_playlist_url = ''
where spotify_playlist_url <> '' and not private.is_valid_spotify_url(spotify_playlist_url, 'playlist');
update public.playlist_share_tracks set track = track - 'spotifyUrl'
where coalesce(track->>'spotifyUrl', '') <> ''
  and not private.is_valid_spotify_url(track->>'spotifyUrl', 'track');

alter table public.artists drop constraint if exists chk_artists_spotify_url;
alter table public.artists add constraint chk_artists_spotify_url check (
  spotify_url is null or private.is_valid_spotify_url(spotify_url, 'artist')
);
alter table public.albums drop constraint if exists chk_albums_spotify_url;
alter table public.albums add constraint chk_albums_spotify_url check (
  spotify_url is null or private.is_valid_spotify_url(spotify_url, 'album')
);
alter table public.tracks drop constraint if exists chk_tracks_spotify_url;
alter table public.tracks add constraint chk_tracks_spotify_url check (
  spotify_url is null or private.is_valid_spotify_url(spotify_url, 'track')
);
alter table public.song_league_recommendations
  drop constraint if exists chk_song_league_recommendations_spotify_url;
alter table public.song_league_recommendations add constraint chk_song_league_recommendations_spotify_url check (
  spotify_url = '' or private.is_valid_spotify_url(spotify_url, 'track')
);
alter table public.song_league_playlists
  drop constraint if exists chk_song_league_playlists_spotify_playlist_url;
alter table public.song_league_playlists add constraint chk_song_league_playlists_spotify_playlist_url check (
  coalesce(spotify_playlist_url, '') = ''
    or private.is_valid_spotify_url(spotify_playlist_url, 'playlist')
);
alter table public.playlist_share_downloads
  drop constraint if exists chk_playlist_share_downloads_spotify_playlist_url;
alter table public.playlist_share_downloads add constraint chk_playlist_share_downloads_spotify_playlist_url check (
  spotify_playlist_url = '' or private.is_valid_spotify_url(spotify_playlist_url, 'playlist')
);
alter table public.playlist_share_tracks
  add constraint chk_playlist_share_tracks_spotify_url check (
    coalesce(track->>'spotifyUrl', '') = ''
      or private.is_valid_spotify_url(track->>'spotifyUrl', 'track')
  );

comment on function private.is_valid_spotify_url(text, text) is
  'Allows only exact HTTPS open.spotify.com entity paths; rejects alternate schemes and confused authorities.';
