export const environment = {
  production: false,
  spotifyUrl: 'https://api.spotify.com/v1',
  appUrl: 'http://127.0.0.1:4200/',
  authorizeUrl: 'https://accounts.spotify.com/authorize',

  // ─── NEW: ADDED FOR SUPABASE & AUTH ───────────────────────────
  supabaseUrl: 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseKey: 'sb_publishable_hMg6wOlMTQai9ipA4ZlxzQ_rawnrTD-',
  spotifyClientId: 'REDACTED_SPOTIFY_CLIENT_ID',
  // [ASSUMED] The callback path will be appended to your local appUrl
  spotifyRedirectUri: 'http://127.0.0.1:4200/callback',
  spotifyScopes: [
    'user-read-private',
    'user-top-read',
    'user-read-recently-played',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read'
  ].join(' ')
};
