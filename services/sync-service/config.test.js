const test = require('node:test');
const assert = require('node:assert/strict');
const {loadIsolated} = require('./test-support/load-isolated.cjs');
function configured(env = {}, files = {}) {
  const previous = process.env;
  process.env = {...env};
  const reads = [];
  const config = loadIsolated('config.js', {fs: {readFileSync(file, encoding) {
    reads.push(file); assert.equal(encoding, 'utf8');
    const key = Object.keys(files).find(key => file.endsWith(key));
    if (key) { if (files[key] instanceof Error) throw files[key]; return files[key]; }
    throw Object.assign(new Error('fixture missing'), {code: 'ENOENT'});
  }}});
  return {config, reads, restore() { process.env = previous; }};
}
const valid = {ADMIN_SPOTIFY_IDS: ' alice, bob,alice, ', SUPABASE_URL: 'https://fixture.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service', SPOTIFY_CLIENT_ID: 'test-client', SPOTIFY_CLIENT_SECRET: 'test-secret', SPOTIFY_TOKEN_ENCRYPTION_KEY: 'test-key'};
test('loads protected environment values, deduplicates administrators and bounds schedule limits', () => {
  const h = configured({...valid, SYNC_SERVICE_POLL_SECONDS: '2', SYNC_SERVICE_MAX_JOBS: '200', SPOTIFY_RESTRICTED_FEATURES_APPROVAL_REFERENCE: ' approval '});
  try {
    const result = h.config.loadConfig();
    assert.deepEqual(result.adminSpotifyIds, ['alice', 'bob']);
    assert.equal(result.pollSeconds, 15); assert.equal(result.maxJobsPerPass, 50);
    assert.equal(result.spotifyRestrictedFeaturesApprovalReference, 'approval');
    assert.equal(result.supabaseServiceRoleKey, 'test-service'); assert.equal(result.spotifyTokenEncryptionKey, 'test-key');
    assert.equal(h.reads.some(file => file.endsWith('.admin-spotify-ids')), false);
  } finally { h.restore(); }
});
test('reads protected files and supports versioned encryption without a legacy key', () => {
  const h = configured({...valid, ADMIN_SPOTIFY_IDS: ' ', ADMIN_SPOTIFY_IDS_FILE: '/test/admins', SPOTIFY_TOKEN_ENCRYPTION_KEY: '', SPOTIFY_TOKEN_ENCRYPTION_KEYS_FILE: '/test/ring', SPOTIFY_TOKEN_ENCRYPTION_WRITE_VERSION: '2', SYNC_SERVICE_MAX_JOBS: '-1', SYNC_SERVICE_POLL_SECONDS: '90'}, {admins: ' a,b \n', ring: '{"2":"new-key"}'});
  try { const result = h.config.loadConfig(); assert.deepEqual(result.adminSpotifyIds, ['a','b']); assert.deepEqual(result.spotifyTokenEncryptionKeys, {2:'new-key'}); assert.equal(result.spotifyTokenEncryptionWriteVersion, 2); assert.equal(result.maxJobsPerPass, 1); assert.equal(result.pollSeconds, 90); } finally {h.restore();}
});
test('configuration defaults remain bounded and missing required values fail closed', () => {
  for (const [key, expected] of [['ADMIN_SPOTIFY_IDS', /at least one/], ['SUPABASE_SERVICE_ROLE_KEY', /SUPABASE_SERVICE_ROLE_KEY/], ['SPOTIFY_CLIENT_ID', /SPOTIFY_CLIENT_ID/], ['SPOTIFY_CLIENT_SECRET', /SPOTIFY_CLIENT_SECRET/], ['SPOTIFY_TOKEN_ENCRYPTION_KEY', /ENCRYPTION_KEY/]]) {
    const h = configured({...valid, [key]: ''});
    try { assert.throws(() => h.config.loadConfig(), expected); } finally {h.restore();}
  }
  const h = configured({...valid, SUPABASE_URL: '', SYNC_SERVICE_MAX_JOBS: 'nonsense', SYNC_SERVICE_POLL_SECONDS: '0'});
  try {const result = h.config.loadConfig(); assert.equal(result.pollSeconds, 60); assert.equal(result.maxJobsPerPass, 10); assert.match(result.supabaseUrl, /^https:/); assert.match(result.spotifyRestrictedFeaturesApprovalReference, /operator-enabled/);} finally {h.restore();}
});
test('rejects malformed key rings and propagates protected-file access failures', () => {
  for (const serialized of ['broken', 'null', '[]', '3']) {
    const h = configured({...valid, SPOTIFY_TOKEN_ENCRYPTION_KEYS: serialized});
    try {assert.throws(() => h.config.credentialKeyConfig(), /valid JSON|JSON object/);} finally {h.restore();}
  }
  const failure = Object.assign(new Error('permission denied'), {code:'EACCES'});
  const h = configured({...valid, ADMIN_SPOTIFY_IDS:''}, {'.admin-spotify-ids':failure});
  try {assert.throws(() => h.config.loadConfig(), /permission denied/);} finally {h.restore();}
});
