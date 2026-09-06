const {webcrypto} = require('crypto');

function decodeKey(version, value) {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32) {
    throw new Error(`Spotify token encryption key version ${version} must be a base64-encoded 32-byte key.`);
  }
  return webcrypto.subtle.importKey('raw', bytes, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

function normalizeKeyRing({encryptionKey, encryptionKeys, writeKeyVersion = 1}) {
  const source = encryptionKeys && Object.keys(encryptionKeys).length ? encryptionKeys : {1: encryptionKey};
  const keys = new Map();
  for (const [rawVersion, value] of Object.entries(source)) {
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1 || typeof value !== 'string') {
      throw new Error('Spotify token encryption key versions must be positive integers.');
    }
    keys.set(version, decodeKey(version, value));
  }
  const writeVersion = Number(writeKeyVersion);
  if (!keys.has(writeVersion)) {
    throw new Error(`Spotify token write key version ${writeVersion} is not present in the key ring.`);
  }
  return {keys, writeVersion};
}

function createCredentialStore({supabase, encryptionKey, encryptionKeys, writeKeyVersion}) {
  const keyRing = normalizeKeyRing({encryptionKey, encryptionKeys, writeKeyVersion});

  async function encrypt(refreshToken) {
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt(
      {name: 'AES-GCM', iv: nonce},
      await keyRing.keys.get(keyRing.writeVersion),
      new TextEncoder().encode(refreshToken)
    );
    return {
      refresh_token_ciphertext: Buffer.from(ciphertext).toString('base64'),
      refresh_token_nonce: Buffer.from(nonce).toString('base64'),
      key_version: keyRing.writeVersion
    };
  }

  async function decrypt(row) {
    const version = Number(row.key_version || 1);
    const key = keyRing.keys.get(version);
    if (!key) throw new Error(`Spotify credential uses unavailable encryption key version ${version}.`);
    try {
      const plaintext = await webcrypto.subtle.decrypt(
        {name: 'AES-GCM', iv: Buffer.from(row.refresh_token_nonce, 'base64')},
        await key,
        Buffer.from(row.refresh_token_ciphertext, 'base64')
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      throw new Error(`Spotify credential encrypted with key version ${version} could not be decrypted.`);
    }
  }

  async function save(userId, connectionMode, clientId, refreshToken) {
    const encrypted = await encrypt(refreshToken);
    const {error} = await supabase.from('spotify_credentials').upsert({
      user_id: userId,
      connection_mode: connectionMode,
      client_id: connectionMode === 'personal_pkce' ? clientId : null,
      ...encrypted,
      updated_at: new Date().toISOString()
    }, {onConflict: 'user_id'});
    if (error) throw error;
  }

  function materialize(userId, row, refreshToken) {
    return {
      userId,
      connectionMode: row.connection_mode,
      clientId: row.client_id || null,
      refreshToken,
      async saveRefreshToken(nextRefreshToken) {
        await save(userId, row.connection_mode, row.client_id || null, nextRefreshToken);
        this.refreshToken = nextRefreshToken;
      }
    };
  }

  async function get(userId, legacyRefreshToken = null) {
    const {data: row, error} = await supabase.from('spotify_credentials')
      .select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (row) {
      const decryptedRefreshToken = await decrypt(row);
      if (legacyRefreshToken) {
        const {error: clearError} = await supabase.from('users')
          .update({spotify_refresh_token: null}).eq('id', userId);
        if (clearError) throw clearError;
      }
      return materialize(userId, row, decryptedRefreshToken);
    }
    if (!legacyRefreshToken) return null;

    await save(userId, 'hosted', null, legacyRefreshToken);
    const {error: clearError} = await supabase.from('users')
      .update({spotify_refresh_token: null}).eq('id', userId);
    if (clearError) throw clearError;
    return materialize(userId, {connection_mode: 'hosted', client_id: null}, legacyRefreshToken);
  }

  async function migrateAllLegacy() {
    const {data: rows, error} = await supabase.from('users')
      .select('id, spotify_refresh_token').not('spotify_refresh_token', 'is', null);
    if (error) throw error;
    for (const row of rows || []) await get(row.id, row.spotify_refresh_token);
    return (rows || []).length;
  }

  async function rotateCredential(row) {
    const previousVersion = Number(row.key_version || 1);
    if (previousVersion === keyRing.writeVersion) return null;
    const refreshToken = await decrypt(row);
    const encrypted = await encrypt(refreshToken);
    await decrypt({...row, ...encrypted});
    return {...encrypted, previous_key_version: previousVersion};
  }

  async function recordRotation(userId, fromVersion, status, errorMessage = null) {
    const {error} = await supabase.from('spotify_credential_rotation_audit').insert({
      user_id: userId,
      from_key_version: fromVersion,
      to_key_version: keyRing.writeVersion,
      status,
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  async function rotatePending(limit = 25) {
    const batchSize = Math.max(1, Math.min(100, Number(limit) || 25));
    const {data: rows, error} = await supabase.from('spotify_credentials')
      .select('*').neq('key_version', keyRing.writeVersion).order('updated_at').limit(batchSize);
    if (error) throw error;
    let rotated = 0;
    let failed = 0;
    for (const row of rows || []) {
      const fromVersion = Number(row.key_version || 1);
      try {
        const replacement = await rotateCredential(row);
        if (!replacement) continue;
        const {previous_key_version: _previous, ...persisted} = replacement;
        const {data: updated, error: updateError} = await supabase.from('spotify_credentials')
          .update({...persisted, updated_at: new Date().toISOString()})
          .eq('user_id', row.user_id).eq('key_version', fromVersion).select('user_id').maybeSingle();
        if (updateError) throw updateError;
        if (!updated) throw new Error('Credential changed during key rotation; retrying on a later pass.');
        await recordRotation(row.user_id, fromVersion, 'succeeded');
        rotated += 1;
      } catch (rotationError) {
        failed += 1;
        const safeMessage = rotationError instanceof Error
          ? rotationError.message.slice(0, 500)
          : 'Unknown credential rotation failure.';
        await recordRotation(row.user_id, fromVersion, 'failed', safeMessage);
      }
    }
    return {examined: (rows || []).length, rotated, failed};
  }

  return {get, save, migrateAllLegacy, rotateCredential, rotatePending, writeKeyVersion: keyRing.writeVersion};
}

module.exports = {createCredentialStore, normalizeKeyRing};
