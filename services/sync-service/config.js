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
    adminSpotifyIds,
    pollSeconds: Math.max(15, Number(process.env.SYNC_SERVICE_POLL_SECONDS) || 60),
    maxJobsPerPass: Math.max(1, Math.min(50, Number(process.env.SYNC_SERVICE_MAX_JOBS) || 10))
  };
}

module.exports = {loadConfig, parseIdList};
