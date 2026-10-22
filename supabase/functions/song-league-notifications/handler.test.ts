import assert from 'node:assert/strict';
import {invoke, userId, type Call, type Reply} from '../_shared/handler-fixture.test.ts';
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function pushFixture() {
  const browser = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const signer = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign']);
  const key = await crypto.subtle.exportKey('jwk', signer.privateKey);
  return {env: {WEB_PUSH_VAPID_PUBLIC_KEY: b64(new Uint8Array(await crypto.subtle.exportKey('raw', signer.publicKey))), WEB_PUSH_VAPID_PRIVATE_KEY: key.d!}, device: {id: 'fixture-device', endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', p256dh: b64(new Uint8Array(await crypto.subtle.exportKey('raw', browser.publicKey))), auth: b64(new Uint8Array(16).fill(9))}};
}
Deno.test('admin notification tests require an authenticated administrator and persist expired-device removal', async () => {
  const f = await pushFixture();
  for (const status of [201, 404, 410, 400]) {
    const result = await invoke('notifications', {action: 'test'}, {...f, reply: call => {
      if (call.url.pathname.endsWith('/app_admins')) return {body: {user_id: userId}};
      if (call.url.pathname.endsWith('/push_subscriptions')) return {body: call.method === 'GET' ? [f.device] : null};
      if (call.url.hostname === 'fcm.googleapis.com') return new Response(null, {status});
    }});
    assert.equal(result.response.status, status === 201 ? 200 : status === 400 ? 500 : 409);
    if (status === 201) assert.deepEqual(result.value, {ok: true, sent: 1});
    assert.equal(result.calls.filter(call => call.method === 'DELETE').length, [404, 410].includes(status) ? 1 : 0);
  }
  const unauthenticated = await invoke('notifications', {action: 'test'}, {reply: call => call.url.pathname === '/auth/v1/user' ? {status: 401, body: {message: 'expired'}} : undefined});
  assert.equal(unauthenticated.response.status, 401);
  for (const failAt of ['/app_admins', '/push_subscriptions']) {
    const result = await invoke('notifications', {action: 'test'}, {reply: call => {
      if (call.url.pathname.endsWith(failAt)) return {status: 400, body: {message: 'fixture read failure'}};
      if (call.url.pathname.endsWith('/app_admins')) return {body: {user_id: userId}};
    }});
    assert.equal(result.response.status, 500);
  }
});
Deno.test('worker delivery processes all three queue types, totals partial failure and retires expired subscriptions', async () => {
  const f = await pushFixture();
  const opening = {...f.device, endpoint: `${f.device.endpoint}/opening`, delivery_id: 'opening', subscription_id: f.device.id, league_id: 'league/fixture', league_name: 'Fixture', opening_date: '2026-10-16', attempts: 1};
  const song = {...opening, endpoint: `${f.device.endpoint}/song`, delivery_id: 'song', delivery_table: 'song_league_song_push_deliveries', track_name: 'Fixture song', recommender_display_name: 'Fixture listener'};
  const access = {...opening, endpoint: `${f.device.endpoint}/access`, delivery_id: 'access', delivery_table: 'stats_access_push_deliveries'};
  for (const failing of ['', 'song', 'access']) {
    let sends = 0;
    const result = await invoke('notifications', {}, {...f, reply: (call): Reply | undefined => {
      if (call.url.pathname.endsWith('/queue_song_league_pick_notifications')) return {body: 3};
      if (call.url.pathname.endsWith('/claim_song_league_push_deliveries')) return {body: [opening]};
      if (call.url.pathname.endsWith('/claim_song_league_song_push_deliveries')) return {body: [song]};
      if (call.url.pathname.endsWith('/claim_stats_access_push_deliveries')) return {body: [access, {...access, endpoint: `${f.device.endpoint}/named-access`, delivery_id: 'named-access', viewer_display_name: 'Fixture viewer'}]};
      if (call.url.hostname === 'fcm.googleapis.com') {sends++; return new Response(null, {status: failing === 'song' && call.url.pathname.endsWith('/song') ? 410 : failing === 'access' && call.url.pathname.endsWith('/access') ? 400 : 201});}
      if (['PATCH', 'DELETE'].includes(call.method)) return {body: null};
    }}, {token: 'fixture-service-key', origin: null});
    assert.equal(result.response.status, 200, JSON.stringify(result.errors));
    assert.deepEqual(result.value, {ok: !failing, queued: 3, sent: failing ? 3 : 4, failed: failing ? 1 : 0});
    assert.equal(sends, 4);
    const writes = result.calls.filter(c => c.method === 'PATCH');
    assert.ok(writes.some(c => c.url.pathname.endsWith('/song_league_push_deliveries')));
    assert.ok(writes.some(c => c.url.pathname.endsWith('/stats_access_push_deliveries')));
    if (failing === 'access') assert.ok(writes.some(c => c.body.status === 'retry'));
    if (failing === 'song') assert.equal(result.calls.filter(c => c.method === 'DELETE').length, 1);
  }
});
Deno.test('admin notification batches preserve successful devices when another subscription has expired', async () => {
  const f = await pushFixture();
  let sends = 0;
  const result = await invoke('notifications', {action: 'test'}, {...f, reply: call => {
    if (call.url.pathname.endsWith('/app_admins')) return {body: {user_id: userId}};
    if (call.url.pathname.endsWith('/push_subscriptions')) return {body: call.method === 'GET' ? Array.from({length: 10}, (_, i) => ({...f.device, id: `device-${i}`})) : null};
    if (call.url.hostname === 'fcm.googleapis.com') {sends++; return new Response(null, {status: sends === 3 ? 410 : 201});}
  }});
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.value, {ok: true, sent: 9});
  assert.equal(sends, 10);
});

Deno.test('notification worker treats null claim data as no deliveries', async () => {
  const result = await invoke('notifications', {}, {reply: call => call.url.pathname.includes('/rpc/') && !call.url.pathname.endsWith('/consume_edge_request_limit') ? {body: null} : undefined}, {token: 'fixture-service-key', origin: null});
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.value, {ok: true, queued: 0, sent: 0, failed: 0});
});
