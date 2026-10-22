import {HOSTED_SPOTIFY_SCOPES} from './spotify-scopes';

/** Dedicated browser fixtures: no shared cloud endpoint or credential. */
export const environment = {
  production: false,
  spotifyUrl: 'https://api.spotify.com/v1',
  appUrl: 'http://127.0.0.1:4214/new/',
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseKey: 'sb_publishable_browser_fixture_only',
  vapidPublicKey: '',
  spotifyClientId: 'browser-fixture-only',
  spotifyRedirectUri: 'http://127.0.0.1:4214/callback',
  personalSpotifyRedirectUri: 'http://127.0.0.1:4214/spotify/callback',
  compareRoomRedirectUri: 'http://127.0.0.1:4214/compare-room/callback',
  spotifyScopes: HOSTED_SPOTIFY_SCOPES.join(' ')
};
