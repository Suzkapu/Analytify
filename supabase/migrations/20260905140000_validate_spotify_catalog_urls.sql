-- Migration: Validate stored Spotify catalog URLs before insertion and navigation
-- Mitigates unconstrained catalog URL fields (OWASP 2025 A05 Injection)

-- Clean up any malformed legacy URLs before applying constraints
UPDATE public.artists
SET spotify_url = NULL
WHERE spotify_url IS NOT NULL
  AND spotify_url !~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?artist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$';

UPDATE public.albums
SET spotify_url = NULL
WHERE spotify_url IS NOT NULL
  AND spotify_url !~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?album/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$';

UPDATE public.tracks
SET spotify_url = NULL
WHERE spotify_url IS NOT NULL
  AND spotify_url !~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?track/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$';

UPDATE public.song_league_recommendations
SET spotify_url = ''
WHERE spotify_url <> ''
  AND spotify_url !~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?track/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$';

UPDATE public.song_league_playlists
SET spotify_playlist_url = ''
WHERE spotify_playlist_url IS NOT NULL
  AND spotify_playlist_url <> ''
  AND spotify_playlist_url !~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?playlist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$';

UPDATE public.playlist_share_downloads
SET spotify_playlist_url = ''
WHERE spotify_playlist_url <> ''
  AND spotify_playlist_url !~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?playlist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$';

-- Enforce strict constraints on catalog tables
ALTER TABLE public.artists DROP CONSTRAINT IF EXISTS chk_artists_spotify_url;
ALTER TABLE public.artists
  ADD CONSTRAINT chk_artists_spotify_url
  CHECK (
    spotify_url IS NULL
    OR spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?artist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$'
  );

ALTER TABLE public.albums DROP CONSTRAINT IF EXISTS chk_albums_spotify_url;
ALTER TABLE public.albums
  ADD CONSTRAINT chk_albums_spotify_url
  CHECK (
    spotify_url IS NULL
    OR spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?album/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$'
  );

ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS chk_tracks_spotify_url;
ALTER TABLE public.tracks
  ADD CONSTRAINT chk_tracks_spotify_url
  CHECK (
    spotify_url IS NULL
    OR spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?track/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$'
  );

ALTER TABLE public.song_league_recommendations DROP CONSTRAINT IF EXISTS chk_song_league_recommendations_spotify_url;
ALTER TABLE public.song_league_recommendations
  ADD CONSTRAINT chk_song_league_recommendations_spotify_url
  CHECK (
    spotify_url = ''
    OR spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?track/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$'
  );

ALTER TABLE public.song_league_playlists DROP CONSTRAINT IF EXISTS chk_song_league_playlists_spotify_playlist_url;
ALTER TABLE public.song_league_playlists
  ADD CONSTRAINT chk_song_league_playlists_spotify_playlist_url
  CHECK (
    spotify_playlist_url IS NULL
    OR spotify_playlist_url = ''
    OR spotify_playlist_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?playlist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$'
  );

ALTER TABLE public.playlist_share_downloads DROP CONSTRAINT IF EXISTS chk_playlist_share_downloads_spotify_playlist_url;
ALTER TABLE public.playlist_share_downloads
  ADD CONSTRAINT chk_playlist_share_downloads_spotify_playlist_url
  CHECK (
    spotify_playlist_url = ''
    OR spotify_playlist_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?playlist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$'
  );
