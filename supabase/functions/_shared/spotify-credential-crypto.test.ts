import check from 'node:assert/strict';
import {
  decryptSpotifyRefreshToken,
  encryptSpotifyRefreshToken,
  normalizeSpotifyCredentialKeyRing,
  spotifyCredentialKeyRingFromEnvironment
} from './spotify-credential-crypto.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

Deno.test('credential key ring reads mixed versions and writes only the active version', async () => {
  const first = randomKey();
  const second = randomKey();
  const versionOne = normalizeSpotifyCredentialKeyRing(first);
  const oldCipher = await encryptSpotifyRefreshToken('old-token', versionOne);
  const rotating = normalizeSpotifyCredentialKeyRing(first, JSON.stringify({1: first, 2: second}), '2');
  const newCipher = await encryptSpotifyRefreshToken('new-token', rotating);

  assert(oldCipher.keyVersion === 1, 'legacy writes should retain version 1');
  assert(newCipher.keyVersion === 2, 'new writes should use the active version');
  assert(await decryptSpotifyRefreshToken({
    connection_mode: 'hosted', client_id: null,
    refresh_token_ciphertext: oldCipher.ciphertext,
    refresh_token_nonce: oldCipher.nonce,
    key_version: oldCipher.keyVersion
  }, rotating) === 'old-token', 'retained keys should decrypt older rows');
});

Deno.test('credential decryption fails closed for retired keys and corrupt ciphertext', async () => {
  const first = randomKey();
  const second = randomKey();
  const encrypted = await encryptSpotifyRefreshToken('token', first);
  const credential = {
    connection_mode: 'hosted' as const,
    client_id: null,
    refresh_token_ciphertext: encrypted.ciphertext,
    refresh_token_nonce: encrypted.nonce,
    key_version: 1
  };

  const retired = normalizeSpotifyCredentialKeyRing('', JSON.stringify({2: second}), '2');
  let retiredMessage = '';
  try { await decryptSpotifyRefreshToken(credential, retired); } catch (error) {
    retiredMessage = error instanceof Error ? error.message : '';
  }
  assert(retiredMessage.includes('unavailable encryption key version 1'), 'a retired key must fail clearly');

  const retained = normalizeSpotifyCredentialKeyRing(first, JSON.stringify({1: first, 2: second}), '2');
  let corruptMessage = '';
  try {
    await decryptSpotifyRefreshToken({...credential, refresh_token_ciphertext: btoa('corrupt')}, retained);
  } catch (error) {
    corruptMessage = error instanceof Error ? error.message : '';
  }
  assert(corruptMessage.includes('could not be decrypted'), 'corrupt ciphertext must fail closed');
});

Deno.test('malformed key rings and unavailable write keys fail before credential encryption', async () => {
  const key = randomKey();
  for (const serialized of ['null', '[]', '3', '"string"']) check.throws(() => normalizeSpotifyCredentialKeyRing(key, serialized), /JSON object/);
  for (const serialized of [JSON.stringify({0: key}), JSON.stringify({'1.5': key}), JSON.stringify({1: 3}), JSON.stringify({'9007199254740992': key})]) check.throws(() => normalizeSpotifyCredentialKeyRing(key, serialized), /positive integers/);
  check.throws(() => normalizeSpotifyCredentialKeyRing('%%%'), /valid base64/);
  check.throws(() => normalizeSpotifyCredentialKeyRing(btoa('short')), /32-byte key/);
  for (const version of ['2', 'NaN', '1.5']) check.throws(() => normalizeSpotifyCredentialKeyRing(key, '', version), /not present/);
  check.equal(normalizeSpotifyCredentialKeyRing(key, '', '').writeVersion, 1);
  await check.rejects(() => encryptSpotifyRefreshToken('fixture', {keys: new Map(), writeVersion: 2}), /unavailable/);
  const encrypted = await encryptSpotifyRefreshToken('legacy-fallback', key);
  check.equal(await decryptSpotifyRefreshToken({connection_mode: 'hosted', client_id: null, refresh_token_ciphertext: encrypted.ciphertext, refresh_token_nonce: encrypted.nonce, key_version: 0}, key), 'legacy-fallback');
});

Deno.test('versioned environment key rings can rotate without retaining the legacy single-key setting', () => {
  const key = randomKey();
  const original = Deno.env.get;
  const fixture: Record<string, string> = {SPOTIFY_TOKEN_ENCRYPTION_KEYS: JSON.stringify({2: key}), SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION: '2'};
  Deno.env.get = name => fixture[name];
  try {
    const ring = spotifyCredentialKeyRingFromEnvironment();
    check.equal(ring.writeVersion, 2);
    check.equal(ring.keys.get(2), key);
    check.equal(ring.keys.has(1), false);
  } finally {Deno.env.get = original;}
});
