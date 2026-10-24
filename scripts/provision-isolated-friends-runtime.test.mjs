import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {test} from 'node:test';
import {POSTGREST, POSTGRES_BIN, downloadArchive, inspectPostgres, installVerifiedArchive, parseArguments, prepareCache, trustedSystemFile, validatePlatform, validateUbuntu, verifyFile} from './provision-isolated-friends-runtime.mjs';
const execute = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'friends-provision-test-'));
  try {await fn(directory);} finally {await rm(directory, {recursive: true, force: true});}
}

test('PostgREST provenance matches the previously verified official release archive and binary', async () => {
  const manifest = JSON.parse(await readFile(new URL('../docs/testing-evidence/design-v2/friends-http-runtime.json', import.meta.url), 'utf8'));
  const archive = manifest.archives.find(item => item.name === 'PostgREST');
  assert.equal(POSTGREST.url, archive.url);
  assert.equal(POSTGREST.sha256, archive.expectedSha256);
  assert.equal(POSTGREST.binarySha256, manifest.binaryHashes['postgrest/postgrest']);
});

test('accepts only offline flag and Linux x64 Ubuntu24.04; refuses external backends and runtime overrides', () => {
  assert.deepEqual(parseArguments([]), {offline: false});
  assert.deepEqual(parseArguments(['--offline']), {offline: true});
  for (const args of [['--offline', '--offline'], ['--database-url=postgres://example/db'], ['--cache-root=/tmp/other'], ['--runtime=/usr/bin'], ['https://example.org']]) assert.throws(() => parseArguments(args));
  validatePlatform('linux', 'x64'); validateUbuntu('ID=ubuntu\nVERSION_ID="24.04"\n');
  for (const pair of [['darwin', 'x64'], ['linux', 'arm64']]) assert.throws(() => validatePlatform(...pair));
  for (const release of ['ID=ubuntu\nVERSION_ID="26.04"', 'ID=debian\nVERSION_ID="24.04"', 'ID_LIKE=ubuntu\nVERSION_ID="24.04"']) assert.throws(() => validateUbuntu(release));
});

test('cache refuses symlink root and ancestor while retaining an unrelated sentinel', async () => fixture(async dir => {
  await mkdir(join(dir, 'actual')); await writeFile(join(dir, 'actual/sentinel'), 'keep');
  await symlink(join(dir, 'actual'), join(dir, 'link'));
  await assert.rejects(prepareCache(join(dir, 'link')), /never symlinks/);
  await assert.rejects(prepareCache(join(dir, 'link/child')), /never symlinks/);
  assert.equal(await readFile(join(dir, 'actual/sentinel'), 'utf8'), 'keep');
  assert.equal(await prepareCache(join(dir, 'owned')), join(dir, 'owned'));
}));

test('cache refuses a world-writable cache without changing its contents', async () => fixture(async dir => {
  const cache = join(dir, 'cache'); await mkdir(cache); await chmod(cache, 0o777);
  await writeFile(join(cache, 'sentinel'), 'keep');
  await assert.rejects(prepareCache(cache), /not group\/world writable/);
  assert.equal(await readFile(join(cache, 'sentinel'), 'utf8'), 'keep');
}));

test('verified extraction refuses changed or symlinked cache bytes before invoking tar', async () => fixture(async dir => {
  const path = join(dir, 'archive'); await writeFile(path, 'corrupted');
  let calls = 0; const extract = async () => {calls++;};
  await assert.rejects(installVerifiedArchive(path, hash('expected'), dir, extract), /SHA256 mismatch/);
  await symlink(path, join(dir, 'link'));
  await assert.rejects(installVerifiedArchive(join(dir, 'link'), hash('corrupted'), dir, extract), /regular files/);
  await assert.rejects(installVerifiedArchive(join(dir, 'missing'), hash('expected'), dir, extract), {code: 'ENOENT'});
  assert.equal(calls, 0);
}));

test('checksum-verified local archive extracts data into its owned destination', async () => fixture(async dir => {
  const source = join(dir, 'source'), destination = join(dir, 'destination');
  await mkdir(source); await mkdir(destination); await writeFile(join(source, 'fixture.txt'), 'verified fixture data');
  const path = join(dir, 'fixture.tar'); await execute('tar', ['-cf', path, '-C', source, 'fixture.txt']);
  const digest = hash(await readFile(path)); await installVerifiedArchive(path, digest, destination);
  assert.equal(await readFile(join(destination, 'fixture.txt'), 'utf8'), 'verified fixture data');
}));

test('system executable trust rejects symlinks, non-root ownership, writable ancestors and non-files', async () => {
  const path = POSTGRES_BIN + '/postgres';
  const metadata = (file, overrides = {}) => ({uid: 0, mode: file ? 0o100755 : 0o40755, isFile: () => file, isDirectory: () => !file, ...overrides});
  const valid = async current => metadata(current === path);
  await trustedSystemFile(path, valid, async value => value);
  await assert.rejects(trustedSystemFile(path, valid, async () => '/tmp/postgres'), /symlinks/);
  for (const overrides of [{uid: 1000}, {mode: 0o100777}, {isFile: () => false}]) {
    await assert.rejects(trustedSystemFile(path, async current => metadata(current === path, current === path ? overrides : {}), async value => value));
  }
  await assert.rejects(trustedSystemFile(path, async current => metadata(current === path, current === '/usr/lib' ? {mode: 0o40777} : {}), async value => value),
    /not group\/world writable: \/usr\/lib \(uid=0, mode=777\)/);
});

test('preinstalled PostgreSQL probe checks all four binaries and pgcrypto assets without service startup', async () => {
  const calls = [], trusted = [];
  const result = await inspectPostgres(async (path, args) => {calls.push({path, args}); return {stdout: 'fixture (PostgreSQL) 16.15 (Ubuntu)\n'};}, async path => {trusted.push(path);});
  assert.equal(Object.keys(result.versions).length, 4);
  assert.deepEqual(calls.map(call => call.path), ['postgres', 'initdb', 'pg_ctl', 'psql'].map(name => join(POSTGRES_BIN, name)));
  assert(calls.every(call => JSON.stringify(call.args) === '["--version"]'));
  assert(trusted.includes('/usr/share/postgresql/16/extension/pgcrypto.control'));
  assert(trusted.includes('/usr/lib/postgresql/16/lib/pgcrypto.so'));
});

test('PostgreSQL probe fails closed for wrong/mixed versions, missing binaries and missing extension assets', async () => {
  for (const output of ['fixture (PostgreSQL) 18.6', 'fixture 16.15', 'fixture (PostgreSQL) 160.15']) {
    await assert.rejects(inspectPostgres(async () => ({stdout: output}), async () => {}), /PostgreSQL16/);
  }
  let count = 0;
  await assert.rejects(inspectPostgres(async () => ({stdout: `fixture (PostgreSQL) 16.${count++}`}), async () => {}), /matching versions/);
  await assert.rejects(inspectPostgres(async () => {throw new Error('binary absent');}, async () => {}), /binary absent/);
  await assert.rejects(inspectPostgres(async () => ({stdout: 'fixture (PostgreSQL) 16.15'}), async path => {if (path.endsWith('pgcrypto.so')) throw new Error('pgcrypto absent');}), /pgcrypto absent/);
});

test('download fails closed for HTTP errors and redirects leaving official HTTPS hosts', async () => {
  for (const target of ['http://archive.archlinux.org/test', 'https://example.org/test', 'https://user:pass@github.com/test']) {
    let calls = 0;
    await assert.rejects(downloadArchive(target, async () => {calls++;}), /official HTTPS/); assert.equal(calls, 0);
  }
  await assert.rejects(downloadArchive(POSTGREST.url, async () => new Response('absent', {status: 404})), /HTTP 404/);
  for (const location of ['http://github.com/asset', 'https://example.org/asset']) {
    let calls = 0;
    await assert.rejects(downloadArchive(POSTGREST.url, async () => {calls++; return new Response(null, {status: 302, headers: {location}});}), /official HTTPS/); assert.equal(calls, 1);
  }
  await assert.rejects(downloadArchive(POSTGREST.url, async () => new Response(null, {status: 302})), /no destination/);
  await assert.rejects(downloadArchive(POSTGREST.url, async () => new Response(null, {status: 302, headers: {location: POSTGREST.url}})), /redirect limit/);
});

test('official redirect bytes remain untrusted until the exact checksum is verified', async () => fixture(async dir => {
  const calls = [];
  const bytes = await downloadArchive(POSTGREST.url, async url => {
    calls.push(String(url));
    return calls.length === 1 ? new Response(null, {status: 302, headers: {location: 'https://release-assets.githubusercontent.com/fixture'}}) : new Response('local fixture only');
  });
  const path = join(dir, 'download'); await writeFile(path, bytes);
  await assert.rejects(verifyFile(path, POSTGREST.sha256), /SHA256 mismatch/);
  assert.equal(calls.length, 2);
}));

test('archive size bound rejects oversized network input', async () => {
  const stream = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(64 * 1024 * 1024 + 1)); controller.close();}});
  await assert.rejects(downloadArchive(POSTGREST.url, async () => new Response(stream)), /64 MiB/);
});

test('CLI refuses external connection arguments before inspecting host or writing a cache', async () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'provision-isolated-friends-runtime.mjs');
  await assert.rejects(execute(process.execPath, [script, '--database-url=postgresql://external.invalid/shared']), error => {
    assert.equal(error.code, 1); assert.match(error.stderr, /Only --offline/); assert.equal(error.stdout, ''); return true;
  });
});
