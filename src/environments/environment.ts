export const environment = {
  production: true,
  spotifyUrl: 'https://api.spotify.com/v1',
  appUrl: 'https://analytify.dynv6.net',
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  supabaseUrl: 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseKey: 'sb_publishable_hMg6wOlMTQai9ipA4ZlxzQ_rawnrTD-',
  // Spotify client IDs are public OAuth identifiers. Never place the client
  // secret in this browser configuration.
  spotifyClientId: '9b03c8eb85dd4df483c3ae097e6c39f0',
  spotifyRedirectUri: 'https://analytify.dynv6.net/callback',
  personalSpotifyRedirectUri: 'https://analytify.dynv6.net/spotify/callback',
  compareRoomRedirectUri: 'https://analytify.dynv6.net/compare-room/callback',
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
