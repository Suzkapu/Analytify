import assert from 'node:assert/strict';
import {deleteExpiredPushSubscription, deliverSongLeaguePush, type Delivery} from './delivery-state.ts';
const delivery: Delivery = {delivery_id: 'delivery', subscription_id: 'subscription', endpoint: 'https://fcm.googleapis.com/fixture', p256dh: 'fixture', auth: 'fixture', league_id: 'league', league_name: 'Fixture', attempts: 1};
function database(error: any = null) {
  const writes: any[] = [];
  return {writes, from(table: string) {return {
    update(values: Record<string, unknown>) {return {eq(column: string, id: string) {writes.push({table, column, id, values}); return Promise.resolve({error});}};},
    delete() {return {eq(column: string, id: string) {writes.push({table, column, id, deleted: true}); return Promise.resolve({error});}};}
  };}};
}
const vapid = {publicKey: 'fixture', privateKey: 'fixture', subject: 'https://fixture.invalid'};
Deno.test('push delivery marks every delivery type sent only after the transport completes', async () => {
  for (const table of [undefined, 'song_league_push_deliveries', 'song_league_song_push_deliveries', 'stats_access_push_deliveries'] as const) {
    const admin = database();
    let release!: () => void;
    const transport = new Promise<void>(resolve => {release = resolve;});
    const pending = deliverSongLeaguePush({...delivery, delivery_table: table}, {admin, vapid, notificationPayload: 'fixture payload', sendWebPush: (_delivery, payload) => {assert.equal(payload, 'fixture payload'); return transport;}, now: () => '2026-10-15T12:00:00Z'});
    assert.equal(admin.writes.length, 0);
    release();
    assert.equal(await pending, true);
    assert.deepEqual(admin.writes, [{table: table || 'song_league_push_deliveries', column: 'id', id: 'delivery', values: {status: 'sent', sent_at: '2026-10-15T12:00:00Z', updated_at: '2026-10-15T12:00:00Z', last_error: null}}]);
  }
  const admin = database();
  assert.equal(await deliverSongLeaguePush(delivery, {admin, vapid, notificationPayload: '{}', sendWebPush: async () => {}}), true);
  assert.ok(Number.isFinite(Date.parse(admin.writes[0].values.sent_at)));
});
Deno.test('expired subscriptions are removed without falsely marking a delivery sent or retryable', async () => {
  for (const statusCode of [404, 410]) {
    const admin = database();
    assert.equal(await deliverSongLeaguePush(delivery, {admin, vapid, notificationPayload: '{}', sendWebPush: async () => {throw {statusCode};}}), false);
    assert.deepEqual(admin.writes, [{table: 'push_subscriptions', column: 'id', id: 'subscription', deleted: true}]);
  }
});
Deno.test('push errors retry below the attempt limit, exhaust at the boundary and truncate private transport details', async () => {
  for (const attempts of [0, 2, 3, 4]) for (const error of [new Error('x'.repeat(600)), 'fixture string error', null, {statusCode: 503}]) {
    const admin = database();
    assert.equal(await deliverSongLeaguePush({...delivery, attempts}, {admin, vapid, notificationPayload: '{}', sendWebPush: async () => {throw error;}, now: () => 'fixture-time'}), false);
    assert.equal(admin.writes[0].values.status, attempts >= 3 ? 'failed' : 'retry');
    assert.ok(admin.writes[0].values.last_error.length <= 500);
    assert.equal(admin.writes[0].values.updated_at, 'fixture-time');
  }
  const admin = database();
  await deliverSongLeaguePush(delivery, {admin, vapid, notificationPayload: '{}', sendWebPush: async () => {throw new Error('retry');}});
  assert.ok(Number.isFinite(Date.parse(admin.writes[0].values.updated_at)));
});
Deno.test('sent, retry and subscription cleanup persistence failures propagate to the caller', async () => {
  for (const error of [new Error('failure'), 'failure', {message: 'failure'}, {}]) {
    await assert.rejects(() => deleteExpiredPushSubscription(database(error), 'subscription'), /failure|Database write failed/i);
    for (const status of [null, 503, 410]) await assert.rejects(() => deliverSongLeaguePush(delivery, {admin: database(error), vapid, notificationPayload: '{}', sendWebPush: async () => {if (status) throw {statusCode: status};}}), /failure|Database write failed/i);
  }
});
