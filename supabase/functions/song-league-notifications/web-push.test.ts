import assert from 'node:assert/strict';
import {sendWebPush} from './web-push.ts';
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function fixture() {
  const client = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const signer = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const signerJwk = await crypto.subtle.exportKey('jwk', signer.privateKey);
  const clientPublic = new Uint8Array(await crypto.subtle.exportKey('raw', client.publicKey));
  const auth = new Uint8Array(16).fill(7);
  return {client, clientPublic, signer, auth,
    subscription: {endpoint: 'https://fcm.googleapis.com/fcm/send/fixture-only', p256dh: b64(clientPublic), auth: b64(auth)},
    vapid: {publicKey: b64(new Uint8Array(await crypto.subtle.exportKey('raw', signer.publicKey))), privateKey: signerJwk.d!, subject: 'https://fixture.invalid'}};
}
async function derive(key: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const imported = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, imported, length * 8));
}
Deno.test('web push sends a verifiable VAPID JWT and payload decryptable by the subscribed browser only', async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  let sent = false;
  globalThis.fetch = (async (input, init) => {
    sent = true;
    assert.equal(String(input), f.subscription.endpoint);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'manual');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('content-encoding'), 'aes128gcm');
    assert.equal(headers.get('ttl'), '86400');
    assert.equal(headers.get('urgency'), 'normal');
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(headers.get('authorization')!)!;
    assert.equal(match[2], f.vapid.publicKey);
    const [header, claims, signature] = match[1].split('.');
    assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64(header))), {typ: 'JWT', alg: 'ES256'});
    const decodedClaims = JSON.parse(new TextDecoder().decode(unb64(claims)));
    assert.equal(decodedClaims.aud, 'https://fcm.googleapis.com');
    assert.equal(decodedClaims.sub, f.vapid.subject);
    assert.ok(Math.abs(decodedClaims.exp - Date.now() / 1000 - 43200) < 2);
    assert.equal(await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, f.signer.publicKey, unb64(signature), encoder.encode(`${header}.${claims}`)), true);
    const body = new Uint8Array(init!.body as Uint8Array);
    assert.equal(new DataView(body.buffer).getUint32(16), 4096);
    assert.equal(body[20], 65);
    const serverPublic = body.slice(21, 86);
    const serverKey = await crypto.subtle.importKey('raw', serverPublic, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
    const secret = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: serverKey}, f.client.privateKey, 256));
    // RFC 8291 receiver-side derivation, using only the browser private key.
    const keyInfo = new Uint8Array([...encoder.encode('WebPush: info\0'), ...f.clientPublic, ...serverPublic]);
    const ikm = await derive(secret, f.auth, keyInfo, 32);
    const salt = body.slice(0, 16);
    const contentKey = await derive(ikm, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await derive(ikm, salt, encoder.encode('Content-Encoding: nonce\0'), 12);
    const aes = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['decrypt']);
    const decrypted = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: nonce}, aes, body.slice(86)));
    assert.equal(decrypted.at(-1), 2);
    assert.equal(new TextDecoder().decode(decrypted.slice(0, -1)), 'Fixture notification 🔊');
    return new Response(null, {status: 201});
  }) as typeof fetch;
  try {await sendWebPush(f.subscription, 'Fixture notification 🔊', f.vapid); assert.equal(sent, true);} finally {globalThis.fetch = original;}
});
Deno.test('web push rejects invalid destinations and signing keys without opening transport', async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  globalThis.fetch = (() => {throw new Error('Unexpected external transport');}) as typeof fetch;
  try {
    await assert.rejects(() => sendWebPush({...f.subscription, endpoint: 'https://127.0.0.1/fixture'}, '{}', f.vapid), /push endpoint/i);
    for (const publicKey of [b64(new Uint8Array(64)), b64(new Uint8Array(65))]) await assert.rejects(() => sendWebPush(f.subscription, '{}', {...f.vapid, publicKey}), /VAPID public key/);
    await assert.rejects(() => sendWebPush({...f.subscription, p256dh: 'invalid'}, '{}', f.vapid));
  } finally {globalThis.fetch = original;}
});
Deno.test('web push consumes no response payload and returns classified HTTP failures, bounded response errors and cancellation recovery', async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  try {
    for (const length of [null, 'bad', '4096', '4097']) for (const status of [201, 410]) {
      let cancelled = false;
      globalThis.fetch = (() => Promise.resolve(new Response(new ReadableStream({cancel() {cancelled = true;}}), {status, headers: length === null ? {} : {'content-length': length}}))) as typeof fetch;
      if (length === '4097') await assert.rejects(() => sendWebPush(f.subscription, '{}', f.vapid), /oversized response/);
      else if (status === 410) await assert.rejects(() => sendWebPush(f.subscription, '{}', f.vapid), (error: any) => error.statusCode === 410);
      else await sendWebPush(f.subscription, '{}', f.vapid);
      assert.equal(cancelled, true);
    }
    for (const length of ['4097', '0']) {
      globalThis.fetch = (() => Promise.resolve(new Response(new ReadableStream({cancel() {throw new Error('fixture cancellation failure');}}), {headers: {'content-length': length}}))) as typeof fetch;
      if (length === '4097') await assert.rejects(() => sendWebPush(f.subscription, '{}', f.vapid), /oversized/);
      else await sendWebPush(f.subscription, '{}', f.vapid);
    }
  } finally {globalThis.fetch = original;}
});
