import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const inventoryPath = path.join(root, 'config', 'browser-storage-inventory.json');
const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));

assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.bannerRequired, false);
assert.match(inventory.legalBasis?.rule || '', /§ 165\(3\)/);
assert.match(inventory.legalBasis?.source || '', /^https:\/\/ris\.bka\.gv\.at\//);
assert.deepEqual(
  [...inventory.prohibitedWithoutPriorConsent].sort(),
  ['A/B testing', 'advertising', 'analytics', 'fingerprinting', 'social plugins'].sort(),
);
assert.deepEqual(inventory.thirdPartyScripts, [], 'third-party scripts require legal review and prior consent');

const mechanisms = new Set();
for (const entry of inventory.storage) {
  assert.ok(entry.mechanism, 'every storage entry needs a mechanism');
  assert.ok(Array.isArray(entry.identifiers) && entry.identifiers.length > 0, `${entry.mechanism} needs identifiers`);
  assert.ok(entry.owner, `${entry.mechanism} needs an owner`);
  assert.ok(entry.purpose, `${entry.mechanism} needs a purpose`);
  assert.ok(entry.duration, `${entry.mechanism} needs a duration`);
  assert.ok(entry.trigger, `${entry.mechanism} needs a trigger`);
  assert.equal(entry.strictlyNecessary, true, `${entry.mechanism} is not approved without prior consent`);
  assert.equal(typeof entry.automaticOnLoggedOutVisit, 'boolean');
  mechanisms.add(entry.mechanism);
}
for (const required of ['cookie', 'localStorage', 'IndexedDB', 'sessionStorage', 'Cache Storage', 'serviceWorker']) {
  assert.ok(mechanisms.has(required), `inventory is missing ${required}`);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(target);
  }
  return files;
}

const apiPatterns = {
  cookie: /document\.cookie/,
  localStorage: /\blocalStorage(?:\.|\[)/,
  sessionStorage: /\bsessionStorage(?:\.|\[)/,
  indexedDB: /\bindexedDB\b/,
  serviceWorker: /ServiceWorkerModule\.register|navigator\.serviceWorker/,
  cacheStorage: /\bcaches\.(?:open|delete|keys|match)/,
};
const appFiles = await sourceFiles(path.join(root, 'src', 'app'));
for (const [api, pattern] of Object.entries(apiPatterns)) {
  const actual = [];
  for (const file of appFiles) {
    if (pattern.test(await readFile(file, 'utf8'))) actual.push(path.relative(root, file));
  }
  actual.sort();
  const approved = [...(inventory.approvedApiFiles[api] || [])].sort();
  assert.deepEqual(actual, approved, `${api} API owners changed; review and update the inventory explicitly`);
}

const index = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
assert.doesNotMatch(index, /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i, 'remote scripts require review and prior consent');

for (const file of appFiles) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /createElement\(\s*["']script["']\s*\)/, `${path.relative(root, file)} injects a script dynamically`);
  assert.doesNotMatch(source, /import\(\s*["']https?:\/\//, `${path.relative(root, file)} imports remote code`);
}

const angular = JSON.parse(await readFile(path.join(root, 'angular.json'), 'utf8'));
const buildScripts = angular.projects?.SpotiFront?.architect?.build?.options?.scripts || [];
assert.deepEqual(buildScripts, [], 'global build scripts require review and inventory approval');
assert.equal(angular.cli?.analytics, false, 'Angular CLI analytics must stay disabled');

const worker = JSON.parse(await readFile(path.join(root, 'ngsw-config.json'), 'utf8'));
assert.ok(!worker.dataGroups || worker.dataGroups.length === 0, 'service worker must not cache API or cross-origin data');
for (const group of worker.assetGroups || []) {
  for (const url of group.resources?.urls || []) {
    assert.doesNotMatch(url, /^https?:\/\//, 'service worker must cache same-origin assets only');
  }
}

const policy = await readFile(path.join(root, 'docs', 'browser-storage-policy.md'), 'utf8');
assert.match(policy, /no cookie banner/i);
assert.match(policy, /fresh logged-out visit creates no cookie/i);
assert.match(policy, /§ 165\(3\) TKG 2021/);

console.log(`Browser storage policy check passed (${inventory.storage.length} inventoried mechanisms).`);
