export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidDetails {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const encoder = new TextEncoder();

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function toBase64Url(value: Uint8Array): string {
  let binary = '';
  value.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function concat(...values: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((length, value) => length + value.length, 0));
  let offset = 0;
  values.forEach(value => {
    result.set(value, offset);
    offset += value.length;
  });
  return result;
}

async function hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, imported, length * 8);
  return new Uint8Array(bits);
}

async function vapidAuthorization(endpoint: string, details: VapidDetails): Promise<string> {
  const publicKey = fromBase64Url(details.publicKey);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('The VAPID public key is invalid.');
  const privateKey = fromBase64Url(details.privateKey);
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    d: toBase64Url(privateKey)
  }, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const header = toBase64Url(encoder.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const claims = toBase64Url(encoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43_200,
    sub: details.subject
  })));
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, encoder.encode(unsigned));
  return `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${details.publicKey}`;
}

async function encryptedBody(subscription: WebPushSubscription, message: string): Promise<Uint8Array> {
  const clientPublic = fromBase64Url(subscription.p256dh);
  const clientKey = await crypto.subtle.importKey(
    'raw', clientPublic, {name: 'ECDH', namedCurve: 'P-256'}, false, []
  );
  const serverKeys = await crypto.subtle.generateKey(
    {name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']
  );
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    {name: 'ECDH', public: clientKey}, serverKeys.privateKey, 256
  ));
  const authSecret = fromBase64Url(subscription.auth);
  const keyInfo = concat(encoder.encode('WebPush: info\0'), clientPublic, serverPublic);
  const inputKeyMaterial = await hkdf(sharedSecret, authSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(inputKeyMaterial, salt, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(inputKeyMaterial, salt, encoder.encode('Content-Encoding: nonce\0'), 12);
  const plaintext = concat(encoder.encode(message), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, aesKey, plaintext));
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  message: string,
  vapid: VapidDetails
): Promise<void> {
  const [body, authorization] = await Promise.all([
    encryptedBody(subscription, message),
    vapidAuthorization(subscription.endpoint, vapid)
  ]);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal'
    },
    body
  });
  if (!response.ok) {
    const error = new Error(`Push service returned HTTP ${response.status}.`) as Error & {statusCode: number};
    error.statusCode = response.status;
    throw error;
  }
}
