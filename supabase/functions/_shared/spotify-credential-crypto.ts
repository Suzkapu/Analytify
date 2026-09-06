export interface StoredSpotifyCredential {
  connection_mode: 'hosted' | 'personal_pkce';
  client_id: string | null;
  refresh_token_ciphertext: string;
  refresh_token_nonce: string;
  key_version: number;
}

export interface SpotifyCredentialKeyRing {
  keys: ReadonlyMap<number, string>;
  writeVersion: number;
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

function validateKey(version: number, rawKey: string): string {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(rawKey);
  } catch {
    throw new Error(`Spotify token encryption key version ${version} is not valid base64.`);
  }
  if (bytes.byteLength !== 32) {
    throw new Error(`Spotify token encryption key version ${version} must be a base64-encoded 32-byte key.`);
  }
  return rawKey;
}

export function normalizeSpotifyCredentialKeyRing(
  legacyKey: string,
  serializedKeys = '',
  rawWriteVersion = '1'
): SpotifyCredentialKeyRing {
  let source: Record<string, unknown> = {'1': legacyKey};
  if (serializedKeys.trim()) {
    const parsed = JSON.parse(serializedKeys);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEYS must be a JSON object keyed by version.');
    }
    source = parsed as Record<string, unknown>;
  }
  const keys = new Map<number, string>();
  for (const [rawVersion, value] of Object.entries(source)) {
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1 || typeof value !== 'string') {
      throw new Error('Spotify token encryption key versions must be positive integers.');
    }
    keys.set(version, validateKey(version, value));
  }
  const writeVersion = Number(rawWriteVersion || '1');
  if (!Number.isSafeInteger(writeVersion) || !keys.has(writeVersion)) {
    throw new Error(`Spotify token write key version ${rawWriteVersion} is not present in the key ring.`);
  }
  return {keys, writeVersion};
}

export function spotifyCredentialKeyRingFromEnvironment(): SpotifyCredentialKeyRing {
  return normalizeSpotifyCredentialKeyRing(
    Deno.env.get('SPOTIFY_TOKEN_ENCRYPTION_KEY') || '',
    Deno.env.get('SPOTIFY_TOKEN_ENCRYPTION_KEYS') || '',
    Deno.env.get('SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION') || '1'
  );
}

async function encryptionKey(rawKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', exactBuffer(decodeBase64(rawKey)), {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']
  );
}

function asKeyRing(keyOrRing: string | SpotifyCredentialKeyRing): SpotifyCredentialKeyRing {
  return typeof keyOrRing === 'string' ? normalizeSpotifyCredentialKeyRing(keyOrRing) : keyOrRing;
}

export async function encryptSpotifyRefreshToken(
  refreshToken: string,
  keyOrRing: string | SpotifyCredentialKeyRing
): Promise<{ciphertext: string; nonce: string; keyVersion: number}> {
  const ring = asKeyRing(keyOrRing);
  const rawKey = ring.keys.get(ring.writeVersion);
  if (!rawKey) throw new Error(`Spotify token write key version ${ring.writeVersion} is unavailable.`);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv: exactBuffer(nonce)},
    await encryptionKey(rawKey),
    new TextEncoder().encode(refreshToken)
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    nonce: encodeBase64(nonce),
    keyVersion: ring.writeVersion
  };
}

export async function decryptSpotifyRefreshToken(
  credential: StoredSpotifyCredential,
  keyOrRing: string | SpotifyCredentialKeyRing
): Promise<string> {
  const ring = asKeyRing(keyOrRing);
  const version = Number(credential.key_version || 1);
  const rawKey = ring.keys.get(version);
  if (!rawKey) throw new Error(`Spotify credential uses unavailable encryption key version ${version}.`);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: exactBuffer(decodeBase64(credential.refresh_token_nonce))},
      await encryptionKey(rawKey),
      exactBuffer(decodeBase64(credential.refresh_token_ciphertext))
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error(`Spotify credential encrypted with key version ${version} could not be decrypted.`);
  }
}
