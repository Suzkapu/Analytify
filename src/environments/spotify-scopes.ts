export const HOSTED_SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read'
] as const;

export const PLAYLIST_WRITE_SPOTIFY_SCOPES = ['playlist-modify-private'] as const;

export const COMPARE_ROOM_SPOTIFY_SCOPES = [
  'user-read-private',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private'
] as const;
