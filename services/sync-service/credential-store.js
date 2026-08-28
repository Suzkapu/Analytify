const {webcrypto} = require('crypto');

function createCredentialStore({supabase, encryptionKey}) {
  const keyBytes = Buffer.from(encryptionKey, 'base64');
  if (keyBytes.length !== 32) {
    throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  const keyPromise = webcrypto.subtle.importKey('raw', keyBytes, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);

  async function encrypt(refreshToken) {
    const nonce = webcrypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await webcrypto.subtle.encrypt(
      {name: 'AES-GCM', iv: nonce},
      await keyPromise,
      new TextEncoder().encode(refreshToken)
    );
    return {
      refresh_token_ciphertext: Buffer.from(ciphertext).toString('base64'),
      refresh_token_nonce: Buffer.from(nonce).toString('base64')
    };
  }

  async function decrypt(row) {
    const plaintext = await webcrypto.subtle.decrypt(
      {name: 'AES-GCM', iv: Buffer.from(row.refresh_token_nonce, 'base64')},
      await keyPromise,
      Buffer.from(row.refresh_token_ciphertext, 'base64')
    );
    return new TextDecoder().decode(plaintext);
  }

  async function save(userId, connectionMode, clientId, refreshToken) {
    const encrypted = await encrypt(refreshToken);
    const {error} = await supabase.from('spotify_credentials').upsert({
      user_id: userId,
      connection_mode: connectionMode,
      client_id: connectionMode === 'personal_pkce' ? clientId : null,
      ...encrypted,
      key_version: 1,
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

    // Staged rollout: encrypt an existing hosted-app token on first use, then
    // erase the deprecated plaintext column only after the encrypted upsert succeeds.
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

  return {get, save, migrateAllLegacy};
}

module.exports = {createCredentialStore};
