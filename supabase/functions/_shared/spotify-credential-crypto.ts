export interface StoredSpotifyCredential {
  connection_mode: 'hosted' | 'personal_pkce';
  client_id: string | null;
  refresh_token_ciphertext: string;
  refresh_token_nonce: string;
  key_version: number;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  value.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function encryptionKey(rawKey: string): Promise<CryptoKey> {
  const bytes = decodeBase64(rawKey);
  if (bytes.byteLength !== 32) {
    throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return crypto.subtle.importKey('raw', exactBuffer(bytes), {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

export async function encryptSpotifyRefreshToken(
  refreshToken: string,
  rawKey: string
): Promise<{ciphertext: string; nonce: string}> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv: exactBuffer(nonce)},
    await encryptionKey(rawKey),
    new TextEncoder().encode(refreshToken)
  );
  return {ciphertext: encodeBase64(new Uint8Array(ciphertext)), nonce: encodeBase64(nonce)};
}

export async function decryptSpotifyRefreshToken(
  credential: StoredSpotifyCredential,
  rawKey: string
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv: exactBuffer(decodeBase64(credential.refresh_token_nonce))},
    await encryptionKey(rawKey),
    exactBuffer(decodeBase64(credential.refresh_token_ciphertext))
  );
  return new TextDecoder().decode(plaintext);
}
