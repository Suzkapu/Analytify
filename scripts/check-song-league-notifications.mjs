import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const migration = readFileSync('supabase/migrations/20260903200000_song_league_push_notifications.sql', 'utf8').toLowerCase();
const songAddedMigration = readFileSync('supabase/migrations/20260904180000_song_league_song_added_notifications.sql', 'utf8').toLowerCase();
const statsRequestMigration = readFileSync('supabase/migrations/20260904190000_stats_history_notifications_and_league_capacity.sql', 'utf8').toLowerCase();
const edgeFunction = readFileSync('supabase/functions/song-league-notifications/index.ts', 'utf8');
const deliveryState = readFileSync('supabase/functions/song-league-notifications/delivery-state.ts', 'utf8');
const dispatcher = readFileSync('services/sync-service/push-dispatcher.js', 'utf8');
const header = readFileSync('src/app/shared/layout/header/header.component.html', 'utf8');
const league = readFileSync('src/app/features/song-league/song-league-detail.component.html', 'utf8');
const admin = readFileSync('src/app/features/admin/admin.component.html', 'utf8');
const claim = readFileSync('src/app/features/song-league/song-league-claim.component.html', 'utf8');
const webPushSource = readFileSync('supabase/functions/song-league-notifications/web-push.ts', 'utf8');

const contracts = [
  ['explicit opt-in default', migration.includes('song_league_enabled boolean not null default false')],
  ['active league membership fan-out', migration.includes('member.left_at is null')],
  ['per-user category preference', migration.includes('preference.song_league_enabled = true')],
  ['per-device delivery uniqueness', migration.includes('unique (league_id, opening_date, subscription_id)')],
  ['timezone-aware Friday opening', migration.includes('p_now at time zone league.timezone')],
  ['concurrent delivery claiming', migration.includes('for update skip locked')],
  ['expired subscription cleanup', (edgeFunction + deliveryState).includes('[404, 410]') && deliveryState.includes("from('push_subscriptions')") && deliveryState.includes('.delete()')],
  ['browser preflight support', edgeFunction.includes("request.method === 'OPTIONS'") && edgeFunction.includes('Access-Control-Allow-Origin')],
  ['PWA notification deep link', edgeFunction.includes("operation: 'openWindow'")],
  ['trusted worker dispatch', dispatcher.includes("invoke('song-league-notifications'")],
  ['Data & account manager', header.includes('notification-settings-modal') && header.includes('Song League')],
  ['in-league notification switch', league.includes('league-notification-control') && league.includes('Turn off')],
  ['admin test delivery', admin.includes('Send test notification')],
  ['post-join notification opt-in', claim.includes('Enable pick notifications?') && claim.includes('Not now')],
  ['new-song notifications default off', songAddedMigration.includes('song_league_song_added_enabled boolean not null default false')],
  ['new-song toggle requires membership', songAddedMigration.includes('join a song league before enabling new-song notifications')],
  ['new-song delivery excludes its author', songAddedMigration.includes('recipient.user_id <> new.recommender_user_id')],
  ['new-song delivery is idempotent per device', songAddedMigration.includes('unique (recommendation_id, subscription_id)')],
  ['new-song delivery queues after recommendation insert', songAddedMigration.includes('after insert on public.song_league_recommendations')],
  ['notification manager gates new-song controls by membership', header.includes('*ngIf="notificationSettings.songLeagueMember"') && header.includes('New Song League picks')],
  ['delivery categories are claimed in parallel', edgeFunction.includes('Promise.all') && edgeFunction.includes('claim_song_league_song_push_deliveries')],
  ['stats requests notify owners by default', statsRequestMigration.includes('stats_access_requests_enabled boolean not null default true')],
  ['stats-request delivery is idempotent per device', statsRequestMigration.includes('unique(request_id, subscription_id)')],
  ['repeat pending requests do not enqueue twice', statsRequestMigration.includes("tg_op = 'insert'") && statsRequestMigration.includes('requested_at is distinct from')],
  ['stats-request claims stay pending and opted in', statsRequestMigration.includes("request.status = 'pending'") && statsRequestMigration.includes('stats_access_requests_enabled')],
  ['stats-request deep link', edgeFunction.includes("'/shared-playlists'") && edgeFunction.includes('claim_stats_access_push_deliveries')],
  ['stats-request preference is manageable', header.includes('Stats access requests') && header.includes('toggleStatsAccessNotifications')]
];

const missing = contracts.filter(([, present]) => !present).map(([label]) => label);
if (missing.length) {
  console.error(`Song League notification contracts are missing: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  const compiledWebPush = ts.transpileModule(webPushSource, {
    compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022}
  }).outputText;
  const webPush = await import(`data:text/javascript;base64,${Buffer.from(compiledWebPush).toString('base64')}`);
  const vapidKeys = await crypto.subtle.generateKey(
    {name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']
  );
  const vapidPublic = new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey));
  const vapidPrivate = await crypto.subtle.exportKey('jwk', vapidKeys.privateKey);
  const clientKeys = await crypto.subtle.generateKey(
    {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']
  );
  const clientPublic = new Uint8Array(await crypto.subtle.exportKey('raw', clientKeys.publicKey));
  const base64Url = value => Buffer.from(value).toString('base64url');
  let request;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    request = {url, options};
    return new Response(null, {status: 201});
  };
  try {
    await webPush.sendWebPush({
      endpoint: 'https://push.example.test/device',
      p256dh: base64Url(clientPublic),
      auth: base64Url(crypto.getRandomValues(new Uint8Array(16)))
    }, JSON.stringify({notification: {title: 'Test'}}), {
      publicKey: base64Url(vapidPublic),
      privateKey: vapidPrivate.d,
      subject: 'https://analytify.dynv6.net'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(request.url, 'https://push.example.test/device');
  assert.match(request.options.headers.Authorization, /^vapid t=.+, k=.+/);
  assert.equal(request.options.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(request.options.body.byteLength > 100);
  console.log('Song League PWA notification contracts and encrypted Web Push request are valid.');
}
