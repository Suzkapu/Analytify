export const environment = {
  production: false,
  spotifyUrl: 'https://api.spotify.com/v1',
  appUrl: 'http://127.0.0.1:4200/',
  authorizeUrl: 'https://accounts.spotify.com/authorize',

  // ─── NEW: ADDED FOR SUPABASE & AUTH ───────────────────────────
  supabaseUrl: 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseKey: 'sb_publishable_hMg6wOlMTQai9ipA4ZlxzQ_rawnrTD-',
  // Spotify client IDs are public OAuth identifiers. Never place the client
  // secret in this browser configuration.
  spotifyClientId: '9b03c8eb85dd4df483c3ae097e6c39f0',
  // [ASSUMED] The callback path will be appended to your local appUrl
  spotifyRedirectUri: 'http://127.0.0.1:4200/callback',
  personalSpotifyRedirectUri: 'http://127.0.0.1:4200/spotify/callback',
  compareRoomRedirectUri: 'http://127.0.0.1:4200/compare-room/callback',
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
