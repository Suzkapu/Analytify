import assert from 'node:assert/strict';
import {invoke, userId, otherId, leagueId, encryptionKey, type Call, type Reply} from '../_shared/handler-fixture.test.ts';
import {encryptSpotifyRefreshToken, decryptSpotifyRefreshToken, normalizeSpotifyCredentialKeyRing} from '../_shared/spotify-credential-crypto.ts';
import {playlistOperationTag} from './recovery.ts';
const member = {user_id: userId, display_name: 'Fixture Listener'};
const payload = {league_name: 'Fixture League', track_uris: ['spotify:track:one'], playlist_revision: 2, round_id: leagueId, playlist_window_start: '2026-10-09'};
const mapping = {user_id: userId, spotify_playlist_id: 'existing-playlist', spotify_playlist_url: 'https://open.spotify.com/playlist/existing', last_synced_revision: 1, last_synced_round_id: leagueId, last_synced_window_start: '2026-10-09'};
type Scenario = {members?: any; profiles?: any; credentials?: any; mappings?: any; payload?: any; reservation?: any; pages?: any[]; create?: any; me?: any; rotate?: boolean; tokenBody?: any; tokenStatus?: number; fail?: (call: Call, calls: Call[]) => boolean; revisionRace?: boolean; continuouslyChanging?: boolean; complete?: boolean; loseLease?: boolean; emptyResponse?: boolean};
function scenarioReply(options: Scenario = {}) {
  let claims = 0, reads = 0, pages = 0;
  return (call: Call, calls: Call[]): Reply | undefined => {
    if (options.fail?.(call, calls)) return {status: 400, body: {message: 'private sync fixture failure'}};
    const path = call.url.pathname;
    if (path.endsWith('/claim_song_league_playlist_sync')) {claims++; return {body: !(options.loseLease && claims > 1)};}
    if (path.endsWith('/get_song_league_weekly_playlist_payload')) {
      reads++;
      const value = options.payload === undefined ? payload : options.payload;
      return {body: value === null ? null : [{...value, ...(options.continuouslyChanging ? {playlist_revision: reads} : options.revisionRace && reads >= 2 ? {playlist_revision: 3} : {})}]};
    }
    if (path.endsWith('/song_league_members')) return {body: call.url.searchParams.get('select') === 'user_id' ? [member] : options.members === undefined ? [member] : options.members};
    if (path.endsWith('/users')) return {body: call.method === 'GET' ? options.profiles === undefined ? [{id: userId, spotify_refresh_token: 'fixture-refresh'}] : options.profiles : null};
    if (path.endsWith('/spotify_credentials')) return {body: call.method === 'GET' ? options.credentials === undefined ? [] : options.credentials : null};
    if (path.endsWith('/song_league_playlists')) return {body: options.mappings === undefined ? [mapping] : options.mappings};
    if (path.endsWith('/reserve_song_league_playlist_sync')) return {body: options.reservation === undefined ? [{operation_marker: 'fixture-operation', spotify_playlist_id: 'existing-playlist', spotify_playlist_url: mapping.spotify_playlist_url}] : options.reservation};
    if (path.endsWith('/complete_song_league_playlist_sync')) return {body: options.complete ?? true};
    if (path.endsWith('/release_song_league_playlist_sync') || path.endsWith('/record_song_league_playlist_sync_failure')) return {body: true};
    if (call.url.hostname === 'accounts.spotify.com') return {status: options.tokenStatus || 200, body: options.tokenBody || {access_token: 'fixture-access', ...(options.rotate ? {refresh_token: 'fixture-rotated'} : {})}};
    if (call.url.hostname === 'api.spotify.com') {
      if (path === '/v1/me') return {body: options.me ?? {id: 'spotify-user'}};
      if (path === '/v1/me/playlists' && call.method === 'GET') return {body: options.pages?.[pages++] || {items: [], next: null}};
      if (path === '/v1/me/playlists') return {body: options.create ?? {id: 'created-playlist', external_urls: {spotify: 'https://open.spotify.com/playlist/created'}}};
      return options.emptyResponse ? new Response(null, {status: 204}) : {body: {snapshot_id: 'fixture-snapshot'}};
    }
  };
}
const worker = {token: 'fixture-service-key', origin: null};
async function sync(options: Scenario = {}, body: any = {leagueId, allMembers: true}, authenticated = false) {return invoke('sync', body, {reply: scenarioReply(options)}, authenticated ? {} : worker);}
Deno.test('playlist synchronization refreshes credentials, writes private metadata and preserves every track in batches', async () => {
  const tracks = Array.from({length: 205}, (_, i) => `spotify:track:${i}`);
  const result = await sync({payload: {...payload, league_name: 'Long league '.repeat(30), track_uris: tracks}, emptyResponse: true});
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.value, {ok: true, revision: 2, synced: 1, skipped: 0, failed: 0, results: [{userId, success: true, skipped: false}]});
  const writes = result.calls.filter(c => c.url.hostname === 'api.spotify.com');
  assert.equal(writes[0].body.public, false);
  assert.equal(writes[0].body.name.length, 100);
  assert.ok(writes[0].body.description.includes(playlistOperationTag('fixture-operation')));
  assert.deepEqual(writes.slice(1).map(c => c.body.uris.length), [100, 100, 5]);
  assert.deepEqual(writes.slice(1).flatMap(c => c.body.uris), tracks);
  const saved = result.calls.find(c => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'POST')!.body;
  assert.equal(await decryptSpotifyRefreshToken(saved, normalizeSpotifyCredentialKeyRing(encryptionKey)), 'fixture-refresh');
  assert.equal(result.calls.at(-1)?.url.pathname, '/rest/v1/rpc/release_song_league_playlist_sync');
});
Deno.test('synced revisions skip Spotify and stale round/window/error state forces a refresh', async () => {
  const current = {...mapping, last_synced_revision: 2};
  for (const overrides of [{}, {last_synced_round_id: otherId}, {last_synced_window_start: '2026-10-02'}, {last_error: 'retry needed'}]) {
    const result = await sync({mappings: [{...current, ...overrides}]});
    assert.equal(result.response.status, 200);
    assert.equal(result.value.skipped, Object.keys(overrides).length ? 0 : 1);
    assert.equal(result.calls.some(c => c.url.hostname === 'accounts.spotify.com'), !!Object.keys(overrides).length);
  }
});
Deno.test('ordinary callers update only their own existing or explicitly requested playlist; workers can target one member', async () => {
  const members = [member, {user_id: otherId}];
  for (const createForCurrentUser of [false, true]) {
    const result = await sync({members, mappings: []}, {leagueId, createForCurrentUser}, true);
    assert.equal(result.response.status, 200);
    assert.equal(result.value.results.length, createForCurrentUser ? 1 : 0);
    if (createForCurrentUser) assert.equal(result.value.results[0].userId, userId);
  }
  for (const body of [{leagueId}, {leagueId, userId}, {leagueId, userId: otherId}]) {
    const result = await sync({members}, body);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value.results.map((r: any) => r.userId), [body.userId || userId]);
  }
  const missingSession = await invoke('sync', {leagueId}, {reply: c => c.url.pathname === '/auth/v1/user' ? {status: 401, body: {message: 'expired'}} : undefined});
  assert.equal(missingSession.response.status, 401);
});
Deno.test('encrypted hosted and personal credentials are decrypted, rotated and migrated without exposing plaintext', async () => {
  for (const connection_mode of ['hosted', 'personal_pkce']) for (const rotate of [false, true]) {
    const encrypted = await encryptSpotifyRefreshToken('fixture-encrypted-refresh', encryptionKey);
    const result = await sync({credentials: [{user_id: userId, connection_mode, client_id: 'b'.repeat(32), refresh_token_ciphertext: encrypted.ciphertext, refresh_token_nonce: encrypted.nonce, key_version: encrypted.keyVersion}], rotate});
    assert.equal(result.response.status, 200);
    assert.equal(result.value.ok, true);
    const token = result.calls.find(c => c.url.hostname === 'accounts.spotify.com')!;
    assert.equal(token.body.refresh_token, 'fixture-encrypted-refresh');
    assert.equal(token.body.client_id, connection_mode === 'personal_pkce' ? 'b'.repeat(32) : 'a'.repeat(32));
    assert.equal('client_secret' in token.body, connection_mode === 'hosted');
    const saved = result.calls.find(c => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'POST');
    assert.equal(!!saved, rotate);
    if (saved) {
      assert.equal(await decryptSpotifyRefreshToken(saved.body, normalizeSpotifyCredentialKeyRing(encryptionKey)), 'fixture-rotated');
      assert.equal(saved.body.client_id, connection_mode === 'personal_pkce' ? 'b'.repeat(32) : null);
    }
  }
});
Deno.test('playlist recovery uses only owned exact markers and creates a destination only when no reusable playlist exists', async () => {
  const recovered = {id: 'recovered', owner: {id: 'spotify-user'}, description: playlistOperationTag('fixture-operation'), external_urls: {spotify: 'https://open.spotify.com/playlist/recovered'}};
  for (const page of [{items: [recovered]}, {items: [{...recovered, owner: {id: 'other'}}]}, {items: []}]) {
    const result = await sync({mappings: [], reservation: {operation_marker: 'fixture-operation'}, pages: [page]});
    assert.equal(result.value.ok, true);
    const creation = result.calls.filter(c => c.method === 'POST' && c.url.pathname === '/v1/me/playlists');
    assert.equal(creation.length, page.items[0]?.owner.id === 'spotify-user' ? 0 : 1);
    const completed = result.calls.find(c => c.url.pathname.endsWith('/complete_song_league_playlist_sync'))!;
    assert.equal(completed.body.p_spotify_playlist_id, creation.length ? 'created-playlist' : 'recovered');
  }
  const dummy = Array.from({length: 50}, (_, i) => ({id: `unrelated-${i}`}));
  const paginated = await sync({mappings: [], reservation: [{operation_marker: 'fixture-operation'}], pages: [{items: dummy, next: 'fixture-next'}, {items: [recovered]}]});
  assert.equal(paginated.value.ok, true);
  assert.deepEqual(paginated.calls.filter(c => c.url.pathname === '/v1/me/playlists' && c.method === 'GET').map(c => c.url.searchParams.get('offset')), ['0', '50']);
  const bounded = await sync({mappings: [], reservation: [{operation_marker: 'fixture-operation'}], pages: Array.from({length: 20}, () => ({items: dummy, next: 'fixture-next'}))});
  assert.equal(bounded.value.ok, true);
  assert.equal(bounded.calls.filter(c => c.url.pathname === '/v1/me/playlists' && c.method === 'GET').length, 20);
});
Deno.test('deleted Spotify destinations are recreated once while other errors remain recoverable failures', async () => {
  const reply = scenarioReply();
  const result = await invoke('sync', {leagueId, allMembers: true}, {reply: (c, calls) => {
    if (c.url.pathname === '/v1/playlists/existing-playlist') return {status: 404, body: {error: 'deleted'}};
    return reply(c, calls);
  }}, worker);
  assert.equal(result.value.ok, true);
  assert.equal(result.calls.filter(c => c.method === 'POST' && c.url.pathname === '/v1/me/playlists').length, 1);
  assert.equal(result.calls.find(c => c.url.pathname.endsWith('/complete_song_league_playlist_sync'))?.body.p_spotify_playlist_id, 'created-playlist');
});
Deno.test('source revision races rerun against the latest payload with at most three passes', async () => {
  for (const options of [{revisionRace: true}, {continuouslyChanging: true}]) {
    const result = await sync(options);
    assert.equal(result.response.status, 200);
    assert.equal(result.value.ok, true);
    assert.equal(result.calls.filter(c => c.url.pathname.endsWith('/get_song_league_weekly_playlist_payload')).length, 'revisionRace' in options ? 4 : 6);
    assert.equal(result.value.revision, 'revisionRace' in options ? 3 : 5);
  }
});
Deno.test('lost leases, stale reservations and completion races report per-member failures and always release the league lease', async () => {
  for (const options of [{loseLease: true}, {reservation: []}, {reservation: {}}, {complete: false}, {profiles: []}, {me: {}, mappings: [], reservation: {operation_marker: 'fixture-operation'}}, {create: {}, mappings: [], reservation: {operation_marker: 'fixture-operation'}}, {tokenBody: {error: 'invalid_grant'}, tokenStatus: 400}]) {
    const result = await sync(options);
    assert.equal(result.response.status, 200);
    assert.equal(result.value.ok, false);
    assert.equal(result.value.failed, 1);
    assert.equal(result.calls.at(-1)?.url.pathname, '/rest/v1/rpc/release_song_league_playlist_sync');
    assert.equal(JSON.stringify(result.value).includes('private sync'), false);
    if ('profiles' in options) assert.match(result.value.results[0].error, /Reconnect Spotify/);
    else assert.match(result.value.results[0].error, /could not be updated/);
  }
});
Deno.test('query and persistence failures are reported at the correct global or member boundary', async () => {
  const globalPredicates = [
    (c: Call) => c.url.pathname.endsWith('/claim_song_league_playlist_sync'),
    (c: Call) => c.url.pathname.endsWith('/get_song_league_weekly_playlist_payload'),
    (c: Call) => c.url.pathname.endsWith('/song_league_members'),
    (c: Call) => c.url.pathname.endsWith('/users') && c.method === 'GET',
    (c: Call) => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'GET',
    (c: Call) => c.url.pathname.endsWith('/song_league_playlists')
  ];
  for (const fail of globalPredicates) assert.equal((await sync({fail})).response.status, 500);
  const memberPredicates = [
    (c: Call, calls: Call[]) => c.url.pathname.endsWith('/claim_song_league_playlist_sync') && calls.filter(c => c.url.pathname.endsWith('/claim_song_league_playlist_sync')).length === 2,
    (c: Call) => c.url.pathname.endsWith('/reserve_song_league_playlist_sync'),
    (c: Call) => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'POST',
    (c: Call) => c.url.pathname.endsWith('/users') && c.method === 'PATCH',
    (c: Call) => c.url.pathname.endsWith('/complete_song_league_playlist_sync'),
    (c: Call) => c.url.hostname === 'api.spotify.com'
  ];
  for (const fail of memberPredicates) {
    const result = await sync({fail});
    assert.equal(result.response.status, 200);
    assert.equal(result.value.failed, 1);
  }
  let reads = 0;
  assert.equal((await sync({fail: c => c.url.pathname.endsWith('/get_song_league_weekly_playlist_payload') && ++reads === 2})).response.status, 500);
  const unavailable = await sync({payload: null});
  assert.equal(unavailable.response.status, 404);
});
Deno.test('one failed member does not prevent another member from synchronizing', async () => {
  const result = await sync({members: [member, {user_id: otherId}], profiles: [{id: otherId, spotify_refresh_token: 'fixture-refresh'}], reservation: [{operation_marker: 'fixture-operation', spotify_playlist_id: 'existing-playlist'}]});
  assert.equal(result.response.status, 200);
  assert.equal(result.value.failed, 1);
  assert.equal(result.value.synced, 1);
  assert.deepEqual(result.value.results.map((r: any) => r.success), [false, true]);
});

Deno.test('empty member, credential and mapping responses remain bounded and do not invoke Spotify for missing targets', async () => {
  for (const members of [null, []]) for (const authenticated of [false, true]) {
    const result = await sync({members, profiles: null, credentials: null, mappings: null}, {leagueId}, authenticated);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value.results, []);
    assert.equal(result.calls.some(c => c.url.hostname === 'api.spotify.com'), false);
  }
  const missingMetadata = await sync({payload: {league_name: 'Fixture', track_uris: 'invalid'}, mappings: [{...mapping, last_synced_revision: 0, last_synced_round_id: null, last_synced_window_start: null}]});
  assert.equal(missingMetadata.value.skipped, 1);
  assert.equal(missingMetadata.value.revision, 0);
  const emptyPlaylist = await sync({payload: {league_name: 'Fixture'}, mappings: [], reservation: {operation_marker: 'fixture-operation'}, create: {id: 'new-without-url'}});
  assert.equal(emptyPlaylist.value.ok, true);
  assert.deepEqual(emptyPlaylist.calls.find(c => c.url.pathname === '/v1/playlists/new-without-url/items')?.body.uris, []);
  assert.equal(emptyPlaylist.calls.find(c => c.url.pathname.endsWith('/complete_song_league_playlist_sync'))?.body.p_spotify_playlist_url, '');
});
Deno.test('personal credentials without a client identifier and malformed token responses fail safely per member', async () => {
  const encrypted = await encryptSpotifyRefreshToken('fixture-refresh', encryptionKey);
  const credentials = [{user_id: userId, connection_mode: 'personal_pkce', client_id: null, refresh_token_ciphertext: encrypted.ciphertext, refresh_token_nonce: encrypted.nonce, key_version: encrypted.keyVersion}];
  assert.equal((await sync({credentials})).value.failed, 1);
  for (const tokenBody of [{}, {error_description: 'private detail'}, {error: 'invalid_grant'}]) assert.equal((await sync({tokenBody, tokenStatus: 400})).value.failed, 1);
  const fallback = scenarioReply();
  const emptyFailure = await invoke('sync', {leagueId, allMembers: true}, {reply: (call, calls) => call.url.hostname === 'api.spotify.com' ? new Response(null, {status: 400, statusText: 'fixture bad request'}) : fallback(call, calls)}, worker);
  assert.equal(emptyFailure.value.failed, 1);
  const membershipFailure = await invoke('sync', {leagueId}, {reply: c => c.url.pathname.endsWith('/song_league_members') ? {status: 400, body: {message: 'fixture membership unavailable'}} : undefined});
  assert.equal(membershipFailure.response.status, 500);
});
Deno.test('a disappeared latest payload revision requests another bounded synchronization pass', async () => {
  let reads = 0;
  const fallback = scenarioReply();
  const result = await invoke('sync', {leagueId, allMembers: true}, {reply: (call, calls) => call.url.pathname.endsWith('/get_song_league_weekly_playlist_payload') && ++reads === 2 ? {body: null} : fallback(call, calls)}, worker);
  assert.equal(result.response.status, 200);
  assert.equal(result.value.ok, true);
  assert.equal(reads, 4);
});
