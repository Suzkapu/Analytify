import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const workerRoot = resolve('services/sync-service');
const manifest = JSON.parse(readFileSync(resolve(workerRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(workerRoot, 'package-lock.json'), 'utf8'));
const deploy = readFileSync('scripts/deploy.sh', 'utf8');

assert.equal(lock.lockfileVersion, 3, 'worker must use a current npm lockfile');
assert.match(
  deploy,
  /cd '\$\{worker_release\}' && npm ci --omit=dev --ignore-scripts/,
  'production must install the locked worker tree with npm ci'
);

for (const dependency of Object.keys(manifest.dependencies || {})) {
  const lockedVersion = lock.packages?.[`node_modules/${dependency}`]?.version;
  assert.match(lockedVersion || '', /^\d+\.\d+\.\d+(?:[-+].+)?$/, `${dependency} must have an exact locked version`);
  const installedManifest = JSON.parse(
    readFileSync(resolve(workerRoot, 'node_modules', dependency, 'package.json'), 'utf8')
  );
  assert.equal(
    installedManifest.version,
    lockedVersion,
    `installed ${dependency} must match the worker lockfile`
  );
}

console.log('Sync worker runtime dependencies are installed from its independent lockfile.');
