import {HOSTED_SPOTIFY_SCOPES} from './spotify-scopes';

export const environment = {
  production: false,
  spotifyUrl: 'https://api.spotify.com/v1',
  appUrl: 'http://127.0.0.1:4200/',
  authorizeUrl: 'https://accounts.spotify.com/authorize',

  // ─── NEW: ADDED FOR SUPABASE & AUTH ───────────────────────────
  supabaseUrl: 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseKey: 'sb_publishable_hMg6wOlMTQai9ipA4ZlxzQ_rawnrTD-',
  vapidPublicKey: 'BIpszothnaePO-LGeIvE4x7AEKMr2YdiyuJZWjkMIlHqPe1Tp3WE79_otTv_C_pQ2C9JwfsnlqcoQn0aVEVcANA',
  // Spotify client IDs are public OAuth identifiers. Never place the client
  // secret in this browser configuration.
  spotifyClientId: '9b03c8eb85dd4df483c3ae097e6c39f0',
  // [ASSUMED] The callback path will be appended to your local appUrl
  spotifyRedirectUri: 'http://127.0.0.1:4200/callback',
  personalSpotifyRedirectUri: 'http://127.0.0.1:4200/spotify/callback',
  compareRoomRedirectUri: 'http://127.0.0.1:4200/compare-room/callback',
  spotifyScopes: HOSTED_SPOTIFY_SCOPES.join(' ')
};
