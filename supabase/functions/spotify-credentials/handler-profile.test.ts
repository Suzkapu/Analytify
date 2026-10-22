import assert from 'node:assert/strict';
import {invoke, userId, otherId, type Call, type Reply} from '../_shared/handler-fixture.test.ts';
import {decryptSpotifyRefreshToken, normalizeSpotifyCredentialKeyRing} from '../_shared/spotify-credential-crypto.ts';
import {encryptionKey} from '../_shared/handler-fixture.test.ts';

type ProfileOptions = {anonymous?: boolean; current?: any; refreshed?: any; existing?: any; conflict?: any; merged?: any; rotated?: boolean; fail?: (call: Call) => boolean; mergeCode?: string; tokenBody?: any; tokenStatus?: number};
function profileReply(options: ProfileOptions = {}) {
  const profile = {id: 'spotify-user', account_id: 'account-user', display_name: '  Fixture Listener  ', images: [{url: 'https://i.scdn.co/image/fixture'}]};
  return (call: Call): Reply | undefined => {
    if (options.fail?.(call)) return {status: 400, body: {message: 'internal private fixture failure', code: options.mergeCode || 'fixture'}};
    if (call.url.pathname === '/auth/v1/user') return {body: {id: userId, is_anonymous: options.anonymous || false}};
    if (call.url.hostname === 'api.spotify.com') return {body: call.headers.get('authorization') === 'Bearer refreshed-access' ? options.refreshed ?? options.current ?? profile : options.current ?? profile};
    if (call.url.hostname === 'accounts.spotify.com') return {status: options.tokenStatus || 200, body: options.tokenBody ?? {access_token: 'refreshed-access', ...(options.rotated ? {refresh_token: 'rotated-refresh'} : {})}};
    if (call.url.pathname.endsWith('/merge_verified_spotify_profile')) return {body: null};
    if (call.url.pathname.endsWith('/users')) {
      if (call.method !== 'GET') return {body: null};
      const select = call.url.searchParams.get('select');
      if (select === 'id,spotify_id,verified_spotify_id') return {body: options.existing === undefined ? null : options.existing};
      if (select === 'id') return {body: options.conflict || null};
      return {body: options.merged || {display_name: 'Existing name', profile_pic_url: 'https://i.scdn.co/existing'}};
    }
    if (call.url.pathname.endsWith('/spotify_credentials')) return {body: null};
  };
}
const base = {profileUserId: userId, action: 'profile', accessToken: 'access'};
Deno.test('verified profile writes server identity, sanitized display and safe image; anonymous profiles keep their cloud alias', async () => {
  for (const anonymous of [false, true]) {
    const result = await invoke('credentials', base, {reply: profileReply({anonymous})});
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value, {ok: true, spotifyId: 'account-user'});
    const saved = result.calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/users')).at(-1)?.body;
    assert.equal(saved.verified_spotify_id, 'account-user');
    assert.equal(saved.display_name, 'Fixture Listener');
    assert.equal(saved.profile_pic_url, 'https://i.scdn.co/image/fixture');
    assert.equal(anonymous ? saved.spotify_id.startsWith('personal:') : saved.spotify_id === 'account-user', true);
    assert.equal(result.calls.some(call => call.url.pathname.endsWith('/spotify_credentials')), false);
  }
});
Deno.test('profile image allowlist and missing display data preserve the existing profile or use safe defaults', async () => {
  for (const image of [undefined, 3, 'bad url', 'x'.repeat(2049), 'http://i.scdn.co/a', 'https://attacker.invalid/a', 'https://sub.spotifycdn.com/a', 'https://sub.fbsbx.com/a']) {
    for (const merged of [{}, {display_name: 'Saved', profile_pic_url: 'https://i.scdn.co/saved'}]) {
      const current = {id: 'spotify-user', display_name: 'Spotify User', images: [{url: image}]};
      const result = await invoke('credentials', base, {reply: profileReply({current, merged})});
      assert.equal(result.response.status, 200);
      const saved = result.calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/users')).at(-1)?.body;
      assert.equal(saved.display_name, 'display_name' in merged ? 'Saved' : 'Spotify User');
      const valid = typeof image === 'string' && (image.includes('sub.spotifycdn.com') || image.includes('sub.fbsbx.com'));
      assert.equal(saved.profile_pic_url, valid ? image : 'profile_pic_url' in merged ? merged.profile_pic_url : null);
    }
  }
});
Deno.test('profile binds requested identity, access credential, refresh credential and existing registration to the same Spotify account', async () => {
  const cases = [
    {body: {...base, spotifyId: 'other'}, options: {}},
    {body: base, options: {existing: {spotify_id: 'other'}}},
    {body: base, options: {existing: {spotify_id: 'spotify-user', verified_spotify_id: 'other'}}},
    {body: base, options: {conflict: {id: otherId}}},
    {body: {...base, action: 'store', connectionMode: 'hosted', refreshToken: 'refresh'}, options: {refreshed: {id: 'other'}}}
  ];
  for (const {body, options} of cases) {
    const result = await invoke('credentials', body, {reply: profileReply(options)});
    assert.equal(result.response.status, 409);
    assert.equal(result.calls.some(call => call.url.pathname.endsWith('/spotify_credentials')), false);
  }
  assert.equal((await invoke('credentials', {...base, spotifyId: 'spotify-user'}, {reply: profileReply({existing: {spotify_id: `pending:${userId}`}})})).response.status, 200);
  assert.equal((await invoke('credentials', base, {reply: profileReply({anonymous: true, conflict: {id: otherId}})})).response.status, 200);
});
Deno.test('credential storage encrypts rotated and retained refresh credentials and clears legacy plaintext only after encrypted persistence', async () => {
  for (const connectionMode of ['hosted', 'personal_pkce']) for (const rotated of [false, true]) {
    const result = await invoke('credentials', {...base, action: 'store', connectionMode, clientId: 'b'.repeat(32), refreshToken: 'fixture-refresh'}, {reply: profileReply({rotated})});
    assert.equal(result.response.status, 200);
    assert.equal(result.value.rotatedRefreshToken, rotated ? 'rotated-refresh' : null);
    const saved = result.calls.find(call => call.url.pathname.endsWith('/spotify_credentials'))!.body;
    assert.equal(saved.client_id, connectionMode === 'hosted' ? null : 'b'.repeat(32));
    assert.equal(await decryptSpotifyRefreshToken(saved, normalizeSpotifyCredentialKeyRing(encryptionKey)), rotated ? 'rotated-refresh' : 'fixture-refresh');
    assert.ok(!JSON.stringify(saved).includes('fixture-refresh'));
    const tokenRequest = result.calls.find(call => call.url.hostname === 'accounts.spotify.com')!;
    assert.equal(tokenRequest.body.client_id, connectionMode === 'hosted' ? 'a'.repeat(32) : 'b'.repeat(32));
    assert.equal('client_secret' in tokenRequest.body, connectionMode === 'hosted');
    assert.deepEqual(result.calls.at(-1)?.body, {spotify_refresh_token: null});
  }
});
Deno.test('profile and credential persistence failures never report success or leak internal details', async () => {
  const predicates = [
    (c: Call) => c.url.hostname === 'api.spotify.com',
    (c: Call) => c.url.pathname.endsWith('/users') && c.method === 'POST' && c.body.spotify_id?.startsWith('pending:'),
    (c: Call) => c.url.searchParams.get('select') === 'id,spotify_id,verified_spotify_id',
    (c: Call) => c.url.pathname.endsWith('/merge_verified_spotify_profile'),
    (c: Call) => c.url.searchParams.get('select') === 'id',
    (c: Call) => c.url.searchParams.get('select') === 'display_name,profile_pic_url',
    (c: Call) => c.url.pathname.endsWith('/users') && c.method === 'POST' && c.body.verified_spotify_id,
    (c: Call) => c.url.pathname.endsWith('/spotify_credentials'),
    (c: Call) => c.url.pathname.endsWith('/users') && c.method === 'PATCH'
  ];
  for (const fail of predicates) {
    const result = await invoke('credentials', {...base, action: 'store', connectionMode: 'hosted', refreshToken: 'fixture-refresh'}, {reply: profileReply({fail})});
    assert.equal(result.response.status, 500);
    assert.equal(JSON.stringify(result.value).includes('internal private'), false);
  }
  for (const mergeCode of ['21000', '23505', '23514']) assert.equal((await invoke('credentials', base, {reply: profileReply({mergeCode, fail: c => c.url.pathname.endsWith('/merge_verified_spotify_profile')})})).response.status, 409);
  for (const tokenBody of [{}, {error: 'invalid_grant'}]) assert.equal((await invoke('credentials', {...base, action: 'store', connectionMode: 'hosted', refreshToken: 'fixture-refresh'}, {reply: profileReply({tokenBody})})).response.status, 500);
});

Deno.test('credential verification handles malformed Spotify JSON and missing client configuration without saving credentials', async () => {
  const body = {...base, action: 'store', connectionMode: 'hosted', refreshToken: 'fixture-refresh'};
  for (const hostname of ['api.spotify.com', 'accounts.spotify.com']) {
    const fallback = profileReply();
    const result = await invoke('credentials', body, {reply: call => call.url.hostname === hostname ? new Response('not-json', {status: 200}) : fallback(call)});
    assert.equal(result.response.status, 500);
    assert.equal(result.calls.some(c => c.url.pathname.endsWith('/spotify_credentials')), false);
  }
  for (const env of [{SPOTIFY_CLIENT_ID: ''}, {SPOTIFY_CLIENT_SECRET: ''}]) assert.equal((await invoke('credentials', body, {env, reply: profileReply()})).response.status, 500);
  const invalid = await invoke('credentials', {...body, connectionMode: 'personal_pkce', clientId: undefined});
  assert.equal(invalid.response.status, 400);
  assert.equal((await invoke('credentials', {action: 'resolve_personal_client', claimedSpotifyId: 'spotify-user'}, {reply: c => c.url.pathname.endsWith('/personal_spotify_identities') ? {status: 400, body: {message: 'fixture unavailable'}} : undefined})).response.status, 500);
});
