import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execute = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_CACHE = join(repository, '.extra_files/isolated-friends-runtime');
// Exact official static archive already recorded in friends-http-runtime.json. No version fallback.
export const POSTGREST = Object.freeze({file: 'postgrest.tar.xz', url: 'https://github.com/PostgREST/postgrest/releases/download/v16.5/postgrest-v16.5-linux-static-x86-64.tar.xz', sha256: '5099e7ada38f9f6846cd87c14c5f158b7c165f1e9959665ad412e61f4dceba95', binarySha256: 'cc218dc89e882ae2b828b3e8d08a1cffd29f4fa126a0869b038ac9e3a12c357d'});
export const POSTGRES_BIN = '/usr/lib/postgresql/16/bin';
const postgresCommands = ['postgres', 'initdb', 'pg_ctl', 'psql'];
export function validateUbuntu(release) {
  assert(/^ID=ubuntu$/m.test(release) && /^VERSION_ID="?24\.04"?$/m.test(release), 'Only Ubuntu24.04 preinstalled PostgreSQL16 is supported by this CI adapter.');
}
export async function trustedSystemFile(path, inspect = lstat, canonical = realpath) {
  assert.equal(await canonical(path), path, 'Preinstalled runtime paths must not resolve through symlinks.');
  let current = path;
  while (true) {
    const metadata = await inspect(current);
    assert(metadata.uid === 0 && !(metadata.mode & 0o022),
      `Preinstalled runtime paths must be root-owned and not group/world writable: ${current} (uid=${metadata.uid}, mode=${(metadata.mode & 0o7777).toString(8)}).`);
    assert(current === path ? metadata.isFile() : metadata.isDirectory(), 'Preinstalled runtime paths must contain only regular files/directories.');
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
}
export async function inspectPostgres(run = execute, trust = trustedSystemFile) {
  const versions = {};
  for (const name of postgresCommands) {
    const path = join(POSTGRES_BIN, name); await trust(path);
    versions[name] = (await run(path, ['--version'], {timeout: 5000})).stdout.trim();
    assert(/^.*\(PostgreSQL\) 16\.\d+(?:\s|$)/.test(versions[name]), `Expected preinstalled PostgreSQL16: ${name}`);
  }
  const versionNumbers = Object.values(versions).map(value => value.match(/16\.\d+/)[0]);
  assert(new Set(versionNumbers).size === 1, 'PostgreSQL binaries must have matching versions.');
  const assets = {control: '/usr/share/postgresql/16/extension/pgcrypto.control', library: '/usr/lib/postgresql/16/lib/pgcrypto.so'};
  for (const path of Object.values(assets)) await trust(path);
  return {versions, assets};
}
export function validatePlatform(platform = process.platform, architecture = process.arch) {
  assert(platform === 'linux' && architecture === 'x64', 'Pinned Friends runtimes support only Linux x86_64; no alternate package fallback.');
}
export function parseArguments(args) {
  assert(args.length <= 1 && args.every(arg => arg === '--offline'), 'Only --offline is accepted; database URLs, runtime overrides and external cache roots are forbidden.');
  return {offline: args.includes('--offline')};
}
export async function verifyFile(path, expected) {
  assert((await lstat(path)).isFile(), 'Runtime cache entries must be regular files, never symlinks.');
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Pinned SHA256 mismatch: ${path}`);
  return bytes;
}
export async function prepareCache(cacheRoot) {
  // Check every existing ancestor before mkdir; do not follow an externally supplied symlink.
  const absolute = resolve(cacheRoot);
  let current = absolute;
  while (true) {
    try {assert((await lstat(current)).isDirectory(), 'Runtime cache ancestors must be directories, never symlinks.');}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
  await mkdir(absolute, {recursive: true, mode: 0o700});
  assert.equal(await realpath(absolute), absolute, 'Runtime cache must have no symlink ancestors.');
  const metadata = await lstat(absolute);
  assert(metadata.uid === process.getuid() && !(metadata.mode & 0o022), 'Runtime cache must be owned by the current user and not group/world writable.');
  return absolute;
}
export async function downloadArchive(url, fetcher = fetch) {
  const allowedHosts = new Set(['github.com', 'release-assets.githubusercontent.com']);
  let target = new URL(url);
  for (let redirects = 0; redirects <= 5; redirects++) {
    assert(target.protocol === 'https:' && allowedHosts.has(target.hostname) && !target.username && !target.password, 'Runtime download must stay on allowlisted official HTTPS hosts.');
    const response = await fetcher(target, {redirect: 'manual', signal: AbortSignal.timeout(60000)});
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      assert(response.headers.get('location'), 'Runtime redirect has no destination.');
      target = new URL(response.headers.get('location'), target); continue;
    }
    assert(response.ok, `Runtime download failed with HTTP ${response.status}; no fallback.`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 64 * 1024 * 1024) throw new Error('Runtime archive exceeds 64 MiB limit.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Runtime download exceeded redirect limit.');
}
export async function installVerifiedArchive(path, expected, destination, extractor = execute) {
  await verifyFile(path, expected);
  await extractor('tar', ['--extract', '--file', path, '--directory', destination, '--no-same-owner', '--no-same-permissions'], {timeout: 30000, maxBuffer: 1024 * 1024});
}
export async function provisionRuntime({offline = false} = {}) {
  validatePlatform(); validateUbuntu(await readFile('/etc/os-release', 'utf8'));
  const postgres = await inspectPostgres();
  const cacheRoot = await prepareCache(DEFAULT_CACHE);
  // The cached extracted binary is never a trusted input; rebuild from the verified archive.
  const workspace = await mkdtemp(join(cacheRoot, '.ci-provision-'));
  let complete = false;
  try {
    const cached = join(cacheRoot, POSTGREST.file);
    try {await verifyFile(cached, POSTGREST.sha256);}
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      assert(!offline, 'Pinned PostgREST archive absent in offline mode.');
      const temporary = join(workspace, POSTGREST.file + '.download');
      await writeFile(temporary, await downloadArchive(POSTGREST.url), {flag: 'wx', mode: 0o600});
      await verifyFile(temporary, POSTGREST.sha256); await rename(temporary, cached);
    }
    const ownedArchive = join(workspace, POSTGREST.file);
    await writeFile(ownedArchive, await verifyFile(cached, POSTGREST.sha256), {flag: 'wx', mode: 0o600});
    const postgresRoot = join(workspace, 'postgres'), postgrestRoot = join(workspace, 'postgrest');
    await mkdir(join(postgresRoot, 'usr/bin'), {recursive: true, mode: 0o700});
    await mkdir(postgrestRoot, {mode: 0o700});
    await installVerifiedArchive(ownedArchive, POSTGREST.sha256, postgrestRoot); await rm(ownedArchive);
    await verifyFile(join(postgrestRoot, 'postgrest'), POSTGREST.binarySha256);
    const postgrestVersion = (await execute(join(postgrestRoot, 'postgrest'), ['--version'], {timeout: 5000})).stdout.trim();
    assert(/^PostgREST 16\.5(?:\s|$)/.test(postgrestVersion), 'Unexpected PostgREST runtime version.');
    for (const name of postgresCommands) await symlink(join(POSTGRES_BIN, name), join(postgresRoot, 'usr/bin', name));
    complete = true;
    return {postgresRoot, postgrestRoot, postgres, postgrestVersion,
      scope: 'Ubuntu24.04 preinstalled PostgreSQL16; pinned PostgREST16.5. No host service/packages changed. The existing contract runner owns its temporary database/socket/signing material.'};
  } finally {
    // Workspace comes directly from mkdtemp inside our validated cache, never from a payload.
    if (!complete) await rm(workspace, {recursive: true, force: true});
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await provisionRuntime(parseArguments(process.argv.slice(2))), null, 2));}
  catch (error) {console.error(`Friends runtime provisioning failed: ${error.message}`); process.exitCode = 1;}
}
