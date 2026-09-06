const fs = require('fs');
const path = require('path');

function readProtectedValue(environmentKey, fileEnvironmentKey, defaultFile) {
  const directValue = (process.env[environmentKey] || '').trim();
  if (directValue) return directValue;
  const configuredFile = process.env[fileEnvironmentKey] || path.join(__dirname, defaultFile);
  try {
    return fs.readFileSync(configuredFile, 'utf8').trim();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return '';
  }
}

function parseIdList(value) {
  return Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean)));
}

function required(name, value) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function credentialKeyConfig() {
  const legacyKey = readProtectedValue(
    'SPOTIFY_TOKEN_ENCRYPTION_KEY',
    'SPOTIFY_TOKEN_ENCRYPTION_KEY_FILE',
    '.spotify-token-encryption-key'
  );
  const serializedRing = readProtectedValue(
    'SPOTIFY_TOKEN_ENCRYPTION_KEYS',
    'SPOTIFY_TOKEN_ENCRYPTION_KEYS_FILE',
    '.spotify-token-encryption-keys'
  );
  let encryptionKeys = null;
  if (serializedRing) {
    try {
      encryptionKeys = JSON.parse(serializedRing);
    } catch {
      throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEYS must be valid JSON.');
    }
    if (!encryptionKeys || typeof encryptionKeys !== 'object' || Array.isArray(encryptionKeys)) {
      throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEYS must be a JSON object keyed by version.');
    }
  }
  if (!encryptionKeys && !legacyKey) {
    throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEYS or SPOTIFY_TOKEN_ENCRYPTION_KEY is required.');
  }
  return {
    spotifyTokenEncryptionKey: legacyKey,
    spotifyTokenEncryptionKeys: encryptionKeys,
    spotifyTokenEncryptionWriteVersion: Number(process.env.SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION || 1)
  };
}

function loadConfig() {
  const adminSpotifyIds = parseIdList(readProtectedValue(
    'ADMIN_SPOTIFY_IDS',
    'ADMIN_SPOTIFY_IDS_FILE',
    '.admin-spotify-ids'
  ));
  if (adminSpotifyIds.length === 0) {
    throw new Error('ADMIN_SPOTIFY_IDS must contain at least one protected Spotify user ID.');
  }

  return {
    supabaseUrl: required('SUPABASE_URL', process.env.SUPABASE_URL || 'https://tmmhylpexbubyznlizfs.supabase.co'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
    spotifyClientId: required('SPOTIFY_CLIENT_ID', process.env.SPOTIFY_CLIENT_ID),
    spotifyClientSecret: required('SPOTIFY_CLIENT_SECRET', process.env.SPOTIFY_CLIENT_SECRET),
    ...credentialKeyConfig(),
    adminSpotifyIds,
    pollSeconds: Math.max(15, Number(process.env.SYNC_SERVICE_POLL_SECONDS) || 60),
    maxJobsPerPass: Math.max(1, Math.min(50, Number(process.env.SYNC_SERVICE_MAX_JOBS) || 10))
  };
}

module.exports = {loadConfig, parseIdList, credentialKeyConfig};
