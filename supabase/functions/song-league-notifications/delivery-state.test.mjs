import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('./delivery-state.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}
}).outputText;
const {deleteExpiredPushSubscription, deliverSongLeaguePush} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const delivery = {
  delivery_id: 'delivery-1',
  subscription_id: 'subscription-1',
  endpoint: 'https://push.example.test/device',
  p256dh: 'p256dh',
  auth: 'auth',
  league_id: 'league-1',
  league_name: 'Test League',
  opening_date: '2026-09-04',
  attempts: 1
};

function createAdmin(error) {
  const writes = [];
  return {
    writes,
    from(table) {
      return {
        update(value) {
          writes.push({table, operation: 'update', value});
          return {async eq(column, id) { return {data: null, error, column, id}; }};
        },
        delete() {
          writes.push({table, operation: 'delete'});
          return {async eq(column, id) { return {data: null, error, column, id}; }};
        }
      };
    }
  };
}

function dependencies(admin, sendWebPush) {
  return {
    admin,
    sendWebPush,
    notificationPayload: '{}',
    vapid: {subject: 'https://example.test', publicKey: 'public', privateKey: 'private'},
    now: () => '2026-09-04T12:00:00.000Z'
  };
}

test('surfaces an error when a successful push cannot be marked sent', async () => {
  const admin = createAdmin(new Error('sent state unavailable'));

  await assert.rejects(
    deliverSongLeaguePush(delivery, dependencies(admin, async () => {})),
    /sent state unavailable/
  );
  assert.equal(admin.writes[0].value.status, 'sent');
});

test('surfaces an error when a failed push cannot be marked for retry', async () => {
  const admin = createAdmin(new Error('retry state unavailable'));

  await assert.rejects(
    deliverSongLeaguePush(delivery, dependencies(admin, async () => {
      throw new Error('push unavailable');
    })),
    /retry state unavailable/
  );
  assert.equal(admin.writes[0].value.status, 'retry');
});

test('surfaces an error when an expired subscription cannot be removed', async () => {
  const admin = createAdmin(new Error('subscription cleanup unavailable'));
  const pushError = Object.assign(new Error('expired'), {statusCode: 410});

  await assert.rejects(
    deliverSongLeaguePush(delivery, dependencies(admin, async () => { throw pushError; })),
    /subscription cleanup unavailable/
  );
  assert.deepEqual(admin.writes[0], {table: 'push_subscriptions', operation: 'delete'});
});

test('the shared expired-subscription cleanup rejects failed admin-test writes', async () => {
  const admin = createAdmin(new Error('admin cleanup unavailable'));

  await assert.rejects(
    deleteExpiredPushSubscription(admin, 'admin-device-1'),
    /admin cleanup unavailable/
  );
  assert.deepEqual(admin.writes[0], {table: 'push_subscriptions', operation: 'delete'});
});

test('updates the dedicated new-song delivery table', async () => {
  const admin = createAdmin(null);
  const songDelivery = {
    ...delivery,
    delivery_table: 'song_league_song_push_deliveries'
  };

  await deliverSongLeaguePush(songDelivery, dependencies(admin, async () => {}));

  assert.equal(admin.writes[0].table, 'song_league_song_push_deliveries');
  assert.equal(admin.writes[0].value.status, 'sent');
});
