import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

const [
  scopes,
  auth,
  interceptor,
  login,
  personalLogin,
  policy,
  workerClient,
  workerScheduler,
  workerCredentials,
  playlists,
  songs,
  stats,
  compareRoom,
  league,
  sharedDetail,
  policyGate,
  routes,
  workerRegistry,
] = await Promise.all([
  read('src/environments/spotify-scopes.ts'),
  read('src/app/core/auth/spotify-auth.service.ts'),
  read('src/app/core/auth/spotify-auth.interceptor.ts'),
  read('src/app/features/auth/login-page/login-page.component.html'),
  read('src/app/features/auth/personal-spotify/personal-spotify-connect.component.html'),
  read('docs/spotify-access-and-attribution.md'),
  read('services/sync-service/spotify-client.js'),
  read('services/sync-service/scheduler.js'),
  read('services/sync-service/credential-store.js'),
  read('src/app/features/library/playlists/playlists.component.html'),
  read('src/app/features/library/songs/songs.component.html'),
  read('src/app/features/insights/user-stats/user-stats.component.html'),
  read('src/app/features/compare-room/compare-room-shell.component.html'),
  read('src/app/features/song-league/song-league-detail.component.html'),
  read('src/app/features/shared-playlists/shared-playlist-detail.component.html'),
  read('src/app/core/compliance/spotify-policy-gate.ts'),
  read('src/app/app-routing.module.ts'),
  read('services/sync-service/task-registry.js'),
]);

const baseScopeBlock = scopes.match(/HOSTED_SPOTIFY_SCOPES\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
assert.ok(baseScopeBlock, 'hosted Spotify read scopes must stay explicit');
assert.doesNotMatch(baseScopeBlock, /playlist-modify-private/, 'playlist writes must not be requested at initial login');
assert.match(baseScopeBlock, /user-top-read/,
  'enabled statistics must request Spotify top-item access');
assert.match(baseScopeBlock, /user-read-recently-played/,
  'enabled history must request Spotify recently-played access');
assert.match(scopes, /PLAYLIST_WRITE_SPOTIFY_SCOPES\s*=\s*\['playlist-modify-private'\]/);
assert.doesNotMatch(scopes, /playlist-modify-public/);
assert.match(auth, /requestPlaylistWriteAuthorization/);
assert.match(interceptor, /requestPlaylistWriteAuthorization/);

for (const page of [login, personalLogin]) {
  assert.match(page, /saved songs/i);
  assert.match(page, /playlists/i);
  assert.match(page, /write access/i);
  assert.match(page, /top songs and artists/i);
  assert.match(page, /recently played songs/i);
}

assert.match(policyGate, /operator-enabled-pending-spotify-determination-2026-09-25/);
assert.match(routes, /spotifyRestrictedFeatureGuard/);
for (const task of ['listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term', 'song_league_playlists']) {
  assert.match(workerRegistry, new RegExp(`['"]${task}['"]`));
}
assert.match(policy, /No written Spotify determination/);
assert.match(policy, /operator explicitly chose to make those features available again/);
assert.match(policy, /not Spotify approval/);

assert.match(workerClient, /invalid_grant/);
assert.match(workerClient, /credential_invalid/);
assert.match(workerScheduler, /credential_invalid/);
assert.match(workerScheduler, /reconnectRequired:\s*true/);
assert.match(workerCredentials, /async function remove\(/);

for (const source of [playlists, songs, stats, compareRoom, league, sharedDetail]) {
  assert.match(source, /spotify-artwork-link/, 'catalog artwork must retain a Spotify destination');
  assert.match(source, /safeSpotifyUrl|open(?:Track|Artist)Click/, 'Spotify destinations must pass through the URL allowlist');
}

for (const requiredReference of [
  'https://developer.spotify.com/documentation/design',
  'https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration',
  'https://developer.spotify.com/documentation/web-api/concepts/quota-modes',
]) assert.match(policy, new RegExp(requiredReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

assert.match(policy, /At most five authenticated Spotify users/);
assert.match(policy, /must be added to its allowlist/);
assert.match(policy, /A `400 invalid_grant` response is terminal/);

console.log('Spotify access, attribution, and reconnect policy contract passed.');
