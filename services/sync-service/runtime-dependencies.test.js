const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

test('sync-worker resolves exact locked runtime dependencies from its own node_modules', () => {
  const syncDir = path.resolve(__dirname);
  const expectedNodeModules = path.join(syncDir, 'node_modules');

  // Verify sync-service has its own isolated node_modules
  assert.ok(
    fs.existsSync(expectedNodeModules),
    `services/sync-service must have its own installed node_modules directory at ${expectedNodeModules}`
  );

  // Verify ws resolution
  const wsEntry = require.resolve('ws', {paths: [syncDir]});
  assert.ok(
    wsEntry.startsWith(expectedNodeModules),
    `ws must resolve from sync-service node_modules, but resolved to: ${wsEntry}`
  );

  const wsPackage = require(path.join(path.dirname(wsEntry), 'package.json'));
  assert.equal(
    wsPackage.version,
    '8.18.3',
    `ws must be locked to version 8.18.3, but found: ${wsPackage.version}`
  );

  // Verify @supabase/supabase-js resolution
  const supabaseEntry = require.resolve('@supabase/supabase-js', {paths: [syncDir]});
  assert.ok(
    supabaseEntry.startsWith(expectedNodeModules),
    `@supabase/supabase-js must resolve from sync-service node_modules, but resolved to: ${supabaseEntry}`
  );

  const supabasePackageJsonPath = path.join(
    expectedNodeModules,
    '@supabase',
    'supabase-js',
    'package.json'
  );
  assert.ok(
    fs.existsSync(supabasePackageJsonPath),
    `@supabase/supabase-js package.json must exist at ${supabasePackageJsonPath}`
  );
  const supabasePackage = JSON.parse(fs.readFileSync(supabasePackageJsonPath, 'utf8'));
  assert.equal(
    supabasePackage.version,
    '2.108.1',
    `@supabase/supabase-js must be locked to version 2.108.1, but found: ${supabasePackage.version}`
  );
});

test('sync-worker package manifest and lockfile enforce exact locked versions', () => {
  const syncDir = path.resolve(__dirname);
  const packageJson = JSON.parse(fs.readFileSync(path.join(syncDir, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(syncDir, 'package-lock.json'), 'utf8'));

  assert.equal(
    packageJson.dependencies['ws'],
    '8.18.3',
    'package.json must pin exact version for ws'
  );
  assert.equal(
    packageJson.dependencies['@supabase/supabase-js'],
    '2.108.1',
    'package.json must pin exact version for @supabase/supabase-js'
  );

  assert.equal(
    packageLock.packages['node_modules/ws'].version,
    '8.18.3',
    'package-lock.json must lock ws to 8.18.3'
  );
  assert.equal(
    packageLock.packages['node_modules/@supabase/supabase-js'].version,
    '2.108.1',
    'package-lock.json must lock @supabase/supabase-js to 2.108.1'
  );
});
