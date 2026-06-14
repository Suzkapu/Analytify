export const environment = {
  production: true,
  spotifyUrl: 'https://api.spotify.com/v1',
  appUrl: 'https://analytify.dynv6.net',
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  supabaseUrl: 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseKey: 'sb_publishable_hMg6wOlMTQai9ipA4ZlxzQ_rawnrTD-',
  spotifyClientId: 'REDACTED_SPOTIFY_CLIENT_ID',
  spotifyRedirectUri: 'https://analytify.dynv6.net/callback',
  spotifyScopes: [
    'user-read-private',
    'user-read-email',
    'user-top-read',
    'user-read-recently-played',
    'user-read-currently-playing',
    'user-read-playback-state',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-library-read'
  ].join(' ')
};

