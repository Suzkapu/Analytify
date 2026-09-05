import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260905180000_secure_push_subscription_endpoints.sql', 'utf8'
).toLowerCase();
const auth = readFileSync('src/app/core/auth/spotify-auth.service.ts', 'utf8');
const webPush = readFileSync('supabase/functions/song-league-notifications/web-push.ts', 'utf8');

const contracts = [
  ['provider allowlist is enforced when registering', migration.includes('private.is_allowed_push_endpoint')],
  ['unlink is scoped to the authenticated owner', migration.includes('user_id = auth.uid() and endpoint = p_endpoint')],
  ['device transfer requires both browser keys', migration.includes('v_subscription.p256dh <> p_p256dh')
    && migration.includes('v_subscription.auth <> p_auth')],
  ['old deliveries are removed before transfer', migration.includes('delete from public.push_subscriptions where id = v_subscription.id')],
  ['endpoint ownership transitions are serialized', migration.includes('pg_advisory_xact_lock')],
  ['logout unlinks before Supabase signout', auth.indexOf('await this.unlinkCurrentPushDevice();')
    < auth.indexOf('await this.supabaseService.client.auth.signOut();')],
  ['browser permission remains intact', !auth.includes('subscription.unsubscribe()')],
  ['delivery revalidates legacy rows', webPush.includes('normalizedPushEndpoint(subscription.endpoint)')],
  ['push fetch rejects redirects', webPush.includes("redirect: 'manual'")],
  ['push response is size bounded and discarded', webPush.includes('content-length')
    && webPush.includes('response.body?.cancel()')]
];

const missing = contracts.filter(([, present]) => !present).map(([name]) => name);
assert.deepEqual(missing, [], `Missing Web Push security contracts: ${missing.join(', ')}`);
console.log('Web Push SSRF and shared-device lifecycle contracts are valid.');
