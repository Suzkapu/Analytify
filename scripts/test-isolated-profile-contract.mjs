import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// Never accepts a database URL: every invocation owns a fresh socket-only cluster.
const execute = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.ANALYTIFY_TEST_POSTGRES_ROOT;
assert(runtime && runtime.startsWith('/'), 'Set ANALYTIFY_TEST_POSTGRES_ROOT to an extracted PostgreSQL runtime');
const workspace = await mkdtemp(join(tmpdir(), 'analytify-profile-contract-'));
const socket = join(workspace, 'socket');
const data = join(workspace, 'data');
const env = { ...process.env, LD_LIBRARY_PATH: join(runtime, 'usr/lib') };
const commands = async (name, args) => execute(join(runtime, 'usr/bin', name), args, { env, maxBuffer: 4 * 1024 * 1024 });
const query = async (sql) => (await commands('psql', ['-X', '-h', socket, '-U', 'analytify_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql])).stdout.trim();
const actorA = '11111111-1111-4111-8111-111111111111';
const actorB = '22222222-2222-4222-8222-222222222222';
const asActor = (id, sql) => `set role authenticated; set request.jwt.claim.sub='${id}'; ${sql}`;
const migrationPaths = [
  'supabase/migrations/20260801000000_foundational_schema.sql',
  'supabase/migrations/20260905153000_lock_spotify_profile_identity.sql',
];
const outcomes = [];
let started = false;
try {
  await mkdir(socket, { mode: 0o700 });
  const version = (await commands('postgres', ['--version'])).stdout.trim();
  await commands('initdb', ['-D', data, '-U', 'analytify_test', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  await commands('pg_ctl', ['-D', data, '-l', join(workspace, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`, '-w', 'start']);
  started = true;
  assert.equal(await query('show listen_addresses'), '');
  await query(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  const migrations = [];
  for (const path of migrationPaths) {
    const bytes = await readFile(join(repository, path));
    await commands('psql', ['-X', '-h', socket, '-U', 'analytify_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(repository, path)]);
    migrations.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await query(`insert into auth.users(id,raw_user_meta_data) values
    ('${actorA}', '{"provider_id":"forged-profile","full_name":"Untrusted name"}'),
    ('${actorB}', '{}');`);
  assert.equal(await query(`select spotify_id || ':' || display_name from public.users where id='${actorA}'`), `pending:${actorA}:Spotify User`);
  outcomes.push('Profile creation ignores user-editable Spotify identity/name metadata');
  assert.equal(await query(asActor(actorA, 'select id from public.users')), actorA);
  outcomes.push('Actor A can read its own profile and cannot enumerate actor B');
  await query(asActor(actorA, `update public.users set backup_active=true where id='${actorA}'`));
  assert.equal(await query(`select backup_active from public.users where id='${actorA}'`), 't');
  await query(asActor(actorA, `update public.users set backup_active=true where id='${actorB}'`));
  assert.equal(await query(`select backup_active from public.users where id='${actorB}'`), 'f');
  outcomes.push('Own backup toggle commits; cross-actor update leaves the other profile unchanged');
  for (const [label, sql] of [
    ['Spotify identity replacement', asActor(actorA, `update public.users set spotify_id='forged' where id='${actorA}'`)],
    ['Forged profile insertion', asActor(actorA, `insert into public.users(id,spotify_id) values ('33333333-3333-4333-8333-333333333333','forged')`)],
    ['Anonymous profile enumeration', 'set role anon; select * from public.users'],
  ]) {
    await assert.rejects(query(sql), (error) => /permission denied/.test(error.stderr));
    outcomes.push(`${label} rejected by real PostgreSQL permissions`);
  }
  const evidence = {
    runnerSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    version, isolation: { freshCluster: true, tcpListeners: false, socketPermissions: '0700', syntheticProfilesOnly: true },
    migrations, outcomes,
    limitations: 'Selected real profile migrations only. auth.users and auth.uid are explicit fixtures; no hosted Auth/JWT, PostgREST, friendship API, full migration chain or production contract is certified.',
  };
  const evidencePath = process.env.ANALYTIFY_PROFILE_CONTRACT_EVIDENCE;
  if (evidencePath) await writeFile(resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(await readFile(join(workspace, 'postgres.log'), 'utf8').catch(() => 'No PostgreSQL server log was created.'));
  throw error;
} finally {
  if (started) await commands('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  await rm(workspace, { recursive: true, force: true });
}
