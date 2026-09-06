import {
  decryptSpotifyRefreshToken,
  encryptSpotifyRefreshToken,
  normalizeSpotifyCredentialKeyRing
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
