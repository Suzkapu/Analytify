import {existsSync, readFileSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {createRequire} from 'node:module';

const rootDir = process.cwd();
const syncServiceDir = resolve(rootDir, 'services/sync-service');
const syncRequire = createRequire(join(syncServiceDir, 'index.js'));

const packageJsonPath = join(syncServiceDir, 'package.json');
const packageLockPath = join(syncServiceDir, 'package-lock.json');
const nodeModulesPath = join(syncServiceDir, 'node_modules');

if (!existsSync(packageJsonPath)) {
  console.error(`Missing ${packageJsonPath}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const checks = [];

// 1. Lockfile presence
checks.push([
  'sync-service has a dedicated committed package-lock.json',
  existsSync(packageLockPath)
]);

let packageLock = null;
if (existsSync(packageLockPath)) {
  packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
}

// 2. Exact pinned versions in package.json (no loose ranges)
const dependencies = packageJson.dependencies || {};
checks.push([
  'sync-service pins exact ws version (8.18.3)',
  dependencies['ws'] === '8.18.3'
]);

checks.push([
  'sync-service pins exact @supabase/supabase-js version (2.108.1)',
  dependencies['@supabase/supabase-js'] === '2.108.1'
]);

// 3. Lockfile locks exact versions
if (packageLock && packageLock.packages) {
  const lockedWs = packageLock.packages['node_modules/ws'];
  const lockedSupabase = packageLock.packages['node_modules/@supabase/supabase-js'];

  checks.push([
    'package-lock.json locks ws to 8.18.3 with integrity hash',
    lockedWs?.version === '8.18.3' && typeof lockedWs?.integrity === 'string'
  ]);

  checks.push([
    'package-lock.json locks @supabase/supabase-js to 2.108.1 with integrity hash',
    lockedSupabase?.version === '2.108.1' && typeof lockedSupabase?.integrity === 'string'
  ]);
} else {
  checks.push(['package-lock.json is valid and contains packages', false]);
}

// 4. Isolated node_modules presence
checks.push([
  'services/sync-service has its own isolated node_modules directory',
  existsSync(nodeModulesPath)
]);

// 5. Module resolution from sync-service
try {
  const resolvedWsPath = syncRequire.resolve('ws');
  const wsPackage = JSON.parse(readFileSync(join(dirname(resolvedWsPath), 'package.json'), 'utf8'));

  checks.push([
    'ws resolves from services/sync-service/node_modules (not root transitive modules)',
    resolvedWsPath.startsWith(nodeModulesPath)
  ]);

  checks.push([
    'ws resolved version is strictly 8.18.3 (not root devDependency 7.5.9)',
    wsPackage.version === '8.18.3'
  ]);
} catch (error) {
  checks.push([`ws module resolution succeeded: ${error.message}`, false]);
}

try {
  const resolvedSupabasePath = syncRequire.resolve('@supabase/supabase-js');
  const supabasePackageJsonPath = join(nodeModulesPath, '@supabase', 'supabase-js', 'package.json');
  const supabasePackage = JSON.parse(readFileSync(supabasePackageJsonPath, 'utf8'));

  checks.push([
    '@supabase/supabase-js resolves from services/sync-service/node_modules',
    resolvedSupabasePath.startsWith(nodeModulesPath)
  ]);

  checks.push([
    '@supabase/supabase-js resolved version is strictly 2.108.1',
    supabasePackage.version === '2.108.1'
  ]);
} catch (error) {
  checks.push([`@supabase/supabase-js module resolution succeeded: ${error.message}`, false]);
}

// 6. Report results
const failures = checks.filter(([, passed]) => !passed).map(([desc]) => desc);

if (failures.length > 0) {
  console.error(`Sync service runtime dependency checks failed:\n${failures.map(f => `  - ❌ ${f}`).join('\n')}`);
  process.exit(1);
} else {
  console.log(`Sync service runtime dependencies are verified (${checks.length}/${checks.length} assertions passed):`);
  checks.forEach(([desc]) => console.log(`  - ✔️ ${desc}`));
}
