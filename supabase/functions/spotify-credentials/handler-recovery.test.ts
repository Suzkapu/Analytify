import assert from 'node:assert/strict';
import {invoke, userId, type Call, type Reply, encryptionKey} from '../_shared/handler-fixture.test.ts';
import {decryptSpotifyRefreshToken, normalizeSpotifyCredentialKeyRing} from '../_shared/spotify-credential-crypto.ts';
const recovery = {action: 'recover_personal_identity', claimedSpotifyId: 'spotify-user', clientId: 'a'.repeat(32), accessToken: 'access', refreshToken: 'refresh'};
type RecoveryOptions = {registered?: any; existing?: any; auth?: any; promoted?: any; link?: any; current?: any; refreshed?: any; scheduled?: boolean; rotated?: boolean; merged?: any; fail?: (call: Call) => boolean; mergeCode?: string};
function recoveryReply(options: RecoveryOptions = {}) {
  const profile = {id: 'spotify-user', display_name: 'Recovered listener', images: [{url: 'https://i.scdn.co/recovered'}]};
  return (call: Call): Reply | undefined => {
    if (options.fail?.(call)) return {status: 400, body: {message: 'private recovery fixture', code: options.mergeCode || 'fixture'}};
    if (call.url.hostname === 'api.spotify.com') return {body: call.headers.get('authorization') === 'Bearer refreshed' ? options.refreshed ?? options.current ?? profile : options.current ?? profile};
    if (call.url.hostname === 'accounts.spotify.com') return {body: {access_token: 'refreshed', ...(options.rotated ? {refresh_token: 'rotated'} : {})}};
    if (call.url.pathname.endsWith('/personal_spotify_identities')) return {body: call.method === 'GET' ? options.registered ?? null : null};
    if (call.url.pathname.endsWith('/users') && call.method === 'GET') return {body: call.url.searchParams.get('select') === 'id' ? options.existing ?? null : options.merged ?? {display_name: 'Saved listener', profile_pic_url: 'https://i.scdn.co/saved'}};
    if (call.url.pathname.endsWith(`/admin/users/${userId}`) && call.method === 'GET' && options.auth === null) return {status: 404, body: {message: 'Fixture identity no longer exists'}};
    if (call.url.pathname.endsWith(`/admin/users/${userId}`)) return {body: call.method === 'GET' ? options.auth ?? {id: userId, email: 'saved@fixture.invalid'} : options.promoted ?? {id: userId}};
    if (call.url.pathname.endsWith('/admin/generate_link')) return {body: options.link ?? {id: userId, hashed_token: 'fixture-token-hash', verification_type: 'magiclink'}};
    if (call.url.pathname.endsWith('/merge_verified_spotify_profile')) return {body: null};
    if (call.url.pathname.endsWith('/users')) return {body: null};
    if (call.url.pathname.endsWith('/spotify_credentials')) return {body: call.method === 'GET' && options.scheduled ? {user_id: userId} : null};
  };
}
Deno.test('personal recovery refuses malformed inputs and independently verified mismatched accounts without identity writes', async () => {
  for (const override of [{claimedSpotifyId: ''}, {clientId: ''}, {clientId: 3}, {accessToken: ''}, {accessToken: 3}, {accessToken: 'x'.repeat(4097)}, {refreshToken: ''}, {refreshToken: 3}, {refreshToken: 'x'.repeat(4097)}]) assert.equal((await invoke('credentials', {...recovery, ...override})).response.status, 400);
  const mismatch = await invoke('credentials', recovery, {reply: recoveryReply({refreshed: {id: 'attacker'}})});
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.calls.some(c => c.url.pathname.endsWith('/personal_spotify_identities')), false);
});
Deno.test('personal recovery preserves existing identity or promotes an anonymous one and returns only the fixture login hash', async () => {
  for (const mode of ['new', 'registered', 'existing', 'promoted', 'stale']) {
    const options: RecoveryOptions = mode === 'new' ? {} : mode === 'existing' ? {existing: {id: userId}} : {registered: {auth_user_id: userId}};
    if (mode === 'promoted') options.auth = {id: userId};
    if (mode === 'stale') options.auth = null;
    const result = await invoke('credentials', recovery, {reply: recoveryReply(options)});
    assert.equal(result.response.status, 200, JSON.stringify(result.value));
    assert.deepEqual(result.value, {tokenHash: 'fixture-token-hash', verificationType: 'magiclink', spotifyId: 'spotify-user', scheduledAccess: false, rotatedRefreshToken: null});
    const link = result.calls.find(c => c.url.pathname.endsWith('/admin/generate_link'))!;
    assert.equal(link.body.type, 'magiclink');
    assert.equal(link.body.email, ['registered', 'existing'].includes(mode) ? 'saved@fixture.invalid' : link.body.email);
    if (!['registered', 'existing'].includes(mode)) assert.match(link.body.email, /^spotify-[a-f0-9]+@identity\.analytify\.invalid$/);
    assert.equal(result.calls.filter(c => c.method === 'PUT').length, mode === 'promoted' ? 1 : 0);
    const registry = result.calls.filter(c => c.url.pathname.endsWith('/personal_spotify_identities') && c.method === 'POST').at(-1)!;
    assert.equal(registry.body.auth_user_id, userId);
  }
});
Deno.test('recovery refreshes an existing schedule with encrypted tokens while preserving profile defaults', async () => {
  for (const rotated of [true, false]) {
    const result = await invoke('credentials', recovery, {reply: recoveryReply({scheduled: true, rotated, current: {id: 'spotify-user', display_name: 'Spotify User'}})});
    assert.equal(result.response.status, 200);
    assert.equal(result.value.scheduledAccess, true);
    assert.equal(result.value.rotatedRefreshToken, rotated ? 'rotated' : null);
    const saved = result.calls.find(c => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'POST')!.body;
    assert.equal(await decryptSpotifyRefreshToken(saved, normalizeSpotifyCredentialKeyRing(encryptionKey)), rotated ? 'rotated' : 'refresh');
    const profile = result.calls.find(c => c.method === 'PATCH')!.body;
    assert.equal(profile.display_name, 'Saved listener');
    assert.equal(profile.profile_pic_url, 'https://i.scdn.co/saved');
  }
  const defaults = await invoke('credentials', recovery, {reply: recoveryReply({current: {id: 'spotify-user', display_name: 3}, merged: {}})});
  assert.equal(defaults.response.status, 200);
  assert.deepEqual(defaults.calls.find(c => c.method === 'PATCH')!.body, {spotify_id: 'spotify-user', verified_spotify_id: 'spotify-user', display_name: 'Spotify User', profile_pic_url: null});
});
Deno.test('recovery surfaces every durable failure without claiming completion or leaking private backend details', async () => {
  const predicates = [
    (c: Call) => c.url.pathname.endsWith('/personal_spotify_identities') && c.method === 'GET',
    (c: Call) => c.url.pathname.endsWith('/users') && c.url.searchParams.get('select') === 'id',
    (c: Call) => c.method === 'PUT',
    (c: Call) => c.url.pathname.endsWith('/admin/generate_link'),
    (c: Call) => c.url.pathname.endsWith('/merge_verified_spotify_profile'),
    (c: Call) => c.url.pathname.endsWith('/users') && c.url.searchParams.get('select') === 'display_name,profile_pic_url',
    (c: Call) => c.method === 'PATCH',
    (c: Call) => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'GET',
    (c: Call) => c.url.pathname.endsWith('/spotify_credentials') && c.method === 'POST',
    (c: Call) => c.url.pathname.endsWith('/personal_spotify_identities') && c.method === 'POST'
  ];
  for (const fail of predicates) {
    const result = await invoke('credentials', recovery, {reply: recoveryReply({fail, registered: {auth_user_id: userId}, auth: {id: userId}, scheduled: true})});
    assert.equal(result.response.status, 500);
    assert.equal(JSON.stringify(result.value).includes('private recovery'), false);
  }
  for (const mergeCode of ['21000', '23505', '23514']) assert.equal((await invoke('credentials', recovery, {reply: recoveryReply({mergeCode, fail: c => c.url.pathname.endsWith('/merge_verified_spotify_profile')})})).response.status, 409);
  for (const link of [{}, {id: userId}, {hashed_token: 'fixture'}]) assert.equal((await invoke('credentials', recovery, {reply: recoveryReply({link})})).response.status, 500);
});
