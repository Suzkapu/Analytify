import assert from 'node:assert/strict';
import {invoke, userId, leagueId, otherId, type Call, type Reply} from './handler-fixture.test.ts';

for (const name of ['credentials', 'sync', 'notifications'] as const) {
  Deno.test(`${name} handler rejects invalid HTTP, origins and oversized requests before business writes`, async () => {
    assert.equal((await invoke(name, {}, {}, {method: 'GET'})).response.status, 405);
    assert.equal((await invoke(name, {}, {}, {method: 'OPTIONS'})).response.status, 204);
    assert.equal((await invoke(name, {}, {}, {method: 'OPTIONS', origin: 'https://attacker.invalid'})).response.status, 403);
    assert.equal((await invoke(name, {}, {env: {SUPABASE_URL: ''}})).response.status, 500);
    const denied = await invoke(name, {}, {}, {origin: 'https://attacker.invalid'});
    assert.equal(denied.response.status, 403);
    assert.ok(denied.calls.every(call => call.url.pathname.includes('consume_edge_request_limit')));
    assert.equal((await invoke(name, {unsupported: true})).response.status, 400);
    assert.equal((await invoke(name, {}, {}, {headers: {'content-length': '999999'}})).response.status, 413);
  });
}

Deno.test('credentials resolution is bounded and does not disclose user credentials', async () => {
  assert.equal((await invoke('credentials', {action: 'resolve_personal_client', claimedSpotifyId: '../invalid'})).response.status, 400);
  for (const stored of [null, {client_id: 'saved-client'}]) {
    const result = await invoke('credentials', {action: 'resolve_personal_client', claimedSpotifyId: 'spotify-user'}, {
      reply: call => call.url.pathname.endsWith('/personal_spotify_identities') ? {body: stored} : undefined
    });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.value, {clientId: stored?.client_id || null});
  }
});
Deno.test('credential profile permissions reject wrong sessions before Spotify requests', async () => {
  assert.equal((await invoke('credentials', {}, {}, {token: null})).response.status, 401);
  const unauthenticated = await invoke('credentials', {}, {reply: call => call.url.pathname === '/auth/v1/user' ? {status: 401, body: {message: 'fixture expired'}} : undefined});
  assert.equal(unauthenticated.response.status, 401);
  for (const profileUserId of ['', otherId, 3]) assert.equal((await invoke('credentials', {profileUserId})).response.status, 403);
  for (const action of [null, 3, 'x'.repeat(33), 'unknown']) assert.equal((await invoke('credentials', {profileUserId: userId, action})).response.status, 400);
  for (const body of [
    {action: 'store'}, {action: 'store', connectionMode: 'personal_pkce', clientId: 'bad'},
    {action: 'profile'}, {action: 'profile', accessToken: 'x'.repeat(4097)},
    {action: 'profile', accessToken: 'access', spotifyId: 'x'.repeat(257)},
    {action: 'store', connectionMode: 'hosted', accessToken: 'access'}
  ]) assert.equal((await invoke('credentials', {profileUserId: userId, ...body})).response.status, 400);
});
Deno.test('credential removal clears only the session profile and reports partial failure', async () => {
  for (const failAt of ['', '/spotify_credentials', '/users']) {
    const result = await invoke('credentials', {action: 'delete_credentials', profileUserId: userId}, {reply: call => {
      if (call.url.pathname.startsWith('/rest/v1/') && !call.url.pathname.includes('/rpc/')) return call.url.pathname.endsWith(failAt) && failAt ? {status: 400, body: {message: 'private fixture detail'}} : {body: null};
    }});
    assert.equal(result.response.status, failAt ? 500 : 200);
    const writes = result.calls.filter(call => ['DELETE', 'PATCH'].includes(call.method));
    assert.ok(writes.every(call => call.url.searchParams.get('user_id') === `eq.${userId}` || call.url.searchParams.get('id') === `eq.${userId}`));
    assert.equal(JSON.stringify(result.value).includes('private fixture detail'), false);
    if (!failAt) assert.deepEqual(writes.at(-1)?.body, {spotify_refresh_token: null});
  }
});
Deno.test('account deletion is restricted to anonymous owners and exposes backend failures safely', async () => {
  assert.equal((await invoke('credentials', {action: 'delete_account', profileUserId: userId})).response.status, 403);
  for (const failAt of ['', '/users', `/admin/users/${userId}`]) {
    const result = await invoke('credentials', {action: 'delete_account', profileUserId: userId}, {reply: call => {
      if (call.url.pathname === '/auth/v1/user') return {body: {id: userId, is_anonymous: true}};
      if (call.method === 'DELETE') return failAt && call.url.pathname.endsWith(failAt) ? {status: 400, body: {message: 'fixture deletion failed'}} : {body: {}};
    }});
    assert.equal(result.response.status, failAt ? 500 : 200);
  }
});

Deno.test('sync validates inputs and rejects fan-out or cross-user requests from ordinary callers', async () => {
  for (const body of [{}, {leagueId, createForCurrentUser: 'yes'}, {leagueId, userId: 5}, {leagueId, userId: 'bad'}, {leagueId, allMembers: 'yes'}]) assert.equal((await invoke('sync', body)).response.status, 400);
  for (const body of [{leagueId, allMembers: true}, {leagueId, userId: otherId}]) assert.equal((await invoke('sync', body)).response.status, 403);
  assert.equal((await invoke('sync', {leagueId}, {reply: call => call.url.pathname.endsWith('/song_league_members') ? {body: null} : undefined})).response.status, 403);
});
Deno.test('sync refuses a busy lease and releases an acquired lease when the league disappears', async () => {
  for (const acquired of [false, true]) {
    const result = await invoke('sync', {leagueId}, {reply: call => {
      if (call.url.pathname.endsWith('/claim_song_league_playlist_sync')) return {body: acquired};
      if (call.url.pathname.endsWith('/get_song_league_weekly_playlist_payload')) return {body: []};
      if (call.url.pathname.endsWith('/release_song_league_playlist_sync')) return {body: true};
    }}, {token: 'fixture-service-key', origin: null});
    assert.equal(result.response.status, acquired ? 404 : 409);
    assert.equal(result.calls.filter(call => call.url.pathname.endsWith('/release_song_league_playlist_sync')).length, acquired ? 1 : 0);
  }
});
Deno.test('notifications validate actions, admin permissions and trusted-worker schedules', async () => {
  for (const body of [{action: 3}, {action: 'x'.repeat(33)}, {action: 'unknown'}]) assert.equal((await invoke('notifications', body)).response.status, 400);
  assert.equal((await invoke('notifications', {})).response.status, 403);
  for (const now of [3, '', 'bad', 'x'.repeat(65)]) assert.equal((await invoke('notifications', {now}, {}, {token: 'fixture-service-key', origin: null})).response.status, 400);
  const noAdmin = await invoke('notifications', {action: 'test'}, {reply: call => call.url.pathname.endsWith('/app_admins') ? {body: null} : undefined});
  assert.equal(noAdmin.response.status, 403);
  const noDevices = await invoke('notifications', {action: 'test'}, {reply: call => call.url.pathname.endsWith('/app_admins') ? {body: {user_id: userId}} : call.url.pathname.endsWith('/push_subscriptions') ? {body: []} : undefined});
  assert.equal(noDevices.response.status, 409);
});
Deno.test('notification worker drains an empty queue with explicit or current time and propagates claim failures', async () => {
  for (const failing of ['', 'queue_song_league_pick_notifications', 'claim_song_league_push_deliveries', 'claim_song_league_song_push_deliveries', 'claim_stats_access_push_deliveries']) {
    const result = await invoke('notifications', failing ? {} : {now: '2026-10-15T12:00:00Z'}, {reply: call => {
      if (call.url.pathname.endsWith(failing) && failing) return {status: 400, body: {message: 'fixture queue failure'}};
      if (call.url.pathname.endsWith('/queue_song_league_pick_notifications')) return {body: 0};
      if (call.url.pathname.includes('/claim_')) return {body: []};
    }}, {token: 'fixture-service-key', origin: null});
    assert.equal(result.response.status, failing ? 500 : 200);
    if (!failing) assert.deepEqual(result.value, {ok: true, queued: 0, sent: 0, failed: 0});
  }
});
