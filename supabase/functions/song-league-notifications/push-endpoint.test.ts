import assert from 'node:assert/strict';
import {normalizedPushEndpoint} from './push-endpoint.ts';

Deno.test('accepts supported browser push providers', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/device',
    'https://updates.push.services.mozilla.com/wpush/v2/device',
    'https://web.push.apple.com/QP/device',
    'https://wns2-par02p.notify.windows.com/w/?token=device'
  ]) assert.equal(normalizedPushEndpoint(endpoint).toString(), endpoint);
});

Deno.test('rejects SSRF, lookalike, credential, port, and redirect-style endpoints', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/device',
    'https://127.0.0.1/device',
    'https://fcm.googleapis.com.evil.test/device',
    'https://fcm.googleapis.com@evil.test/device',
    'https://user@fcm.googleapis.com/device',
    'https://fcm.googleapis.com:8443/device',
    'not a url'
  ]) assert.throws(() => normalizedPushEndpoint(endpoint), /push endpoint/i);
});
