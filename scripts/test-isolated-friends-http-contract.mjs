import assert from 'node:assert/strict';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {execFile, spawn} from 'node:child_process';
import {mkdtemp, readFile, mkdir, rm, writeFile, realpath, stat} from 'node:fs/promises';
import {createServer, request as httpRequest} from 'node:http';
import {createServer as createNetServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';

// Only local executable directories are accepted. No external database/backend URL.
assert(process.argv.slice(2).every(arg => ['--handshake-only', '--angular-contract'].includes(arg)), 'Only --handshake-only or --angular-contract is accepted; external connection arguments are forbidden.');
const handshakeOnly = process.argv.includes('--handshake-only');
const angularContract = process.argv.includes('--angular-contract');
assert(!(handshakeOnly && angularContract), 'Choose either handshake-only or the full Angular contract.');
async function runtimeDirectory(name) {
  const path = process.env[name];
  assert(path && isAbsolute(path) && !path.includes('\n') && !path.includes("'"), `${name} must be a local absolute runtime directory.`);
  const canonical = await realpath(path);
  assert((await stat(canonical)).isDirectory(), `${name} must name a directory.`);
  return canonical;
}
const postgresRoot = await runtimeDirectory('ANALYTIFY_TEST_POSTGRES_ROOT');
const postgrestRoot = await runtimeDirectory('ANALYTIFY_TEST_POSTGREST_ROOT');
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const workspace = await mkdtemp(join(tmpdir(), 'analytify-friends-http-'));
const socket = join(workspace, 'socket');
const data = join(workspace, 'data');
const runtimeEnv = {PATH: process.env.PATH || '/usr/bin:/bin', LC_ALL: 'C', LD_LIBRARY_PATH: join(postgresRoot, 'usr/lib')};
const commands = (name, args) => execute(join(postgresRoot, 'usr/bin', name), args, {env: runtimeEnv, timeout: 15000, maxBuffer: 4 * 1024 * 1024});
const query = async sql => (await commands('psql', ['-X', '-h', socket, '-U', 'analytify_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql])).stdout.trim();
const actorA = '11111111-1111-4111-8111-111111111111';
const actorB = '22222222-2222-4222-8222-222222222222';
const actorC = '33333333-3333-4333-8333-333333333333';
const unverified = '44444444-4444-4444-8444-444444444444';
const jwtSecret = randomBytes(48).toString('hex');
const fixtureNonce = randomBytes(32).toString('hex');
function jwt(subject, extra = {}, secret = jwtSecret) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {role: 'authenticated', sub: subject, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...extra};
  const prefix = `${encode({alg: 'HS256', typ: 'JWT'})}.${encode(payload)}`;
  return `${prefix}.${createHmac('sha256', secret).update(prefix).digest('base64url')}`;
}
async function freeLoopbackPort() {
  const probe = createNetServer();
  await new Promise((yes, no) => {probe.once('error', no); probe.listen(0, '127.0.0.1', yes);});
  const port = probe.address().port;
  await new Promise((yes, no) => probe.close(error => error ? no(error) : yes()));
  return port;
}
async function within(promise, milliseconds, label) {
  let deadline;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    })]);
  } finally {clearTimeout(deadline);}
}
const migrationPaths = [
  'supabase/migrations/20260801000000_foundational_schema.sql',
  'supabase/migrations/20260905153000_lock_spotify_profile_identity.sql',
  'supabase/migrations/20260801181500_playlist_sharing.sql',
  'supabase/migrations/20260902190000_stats_spy_mode.sql',
  'supabase/migrations/20261011162823_design_v2_single_use_friend_invitations.sql'
];
const outcomes = [];
const lifecycleAbort = new AbortController();
let postgresAttempted = false;
let dropNextRpcResponse;
let postgrest;
let postgrestExit;
let gateway;
let failure;
let evidence;
const onInterrupt = () => {lifecycleAbort.abort(new Error('Isolated contract interrupted.')); postgrest?.kill('SIGTERM');};
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onInterrupt);
try {
  await mkdir(socket, {mode: 0o700});
  const postgresVersion = (await commands('postgres', ['--version'])).stdout.trim();
  const postgrestVersion = (await execute(join(postgrestRoot, 'postgrest'), ['--version'], {env: runtimeEnv, timeout: 5000})).stdout.trim();
  await commands('initdb', ['-D', data, '-U', 'analytify_test', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  postgresAttempted = true;
  await commands('pg_ctl', ['-D', data, '-l', join(workspace, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700`, '-w', 'start']);
  assert.equal(await query('show listen_addresses'), '');
  await query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator login noinherit nosuperuser nocreatedb nocreaterole;
    grant anon, authenticated to authenticator;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  const migrations = [];
  for (const path of migrationPaths) {
    if (path.includes('20261011162823')) {
      // Same explicit prerequisite as native contract; not the complete migration chain.
      await query(`alter table public.users add column verified_spotify_id text;
        insert into auth.users(id) values ('${actorA}'),('${actorB}'),('${actorC}'),('${unverified}');
        update public.users set verified_spotify_id='synthetic-' || id::text where id<>'${unverified}';`);
    }
    await commands('psql', ['-X', '-h', socket, '-U', 'analytify_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', join(repository, path)]);
    migrations.push({path, sha256: createHash('sha256').update(await readFile(join(repository, path))).digest('hex')});
  }
  const backendPort = await freeLoopbackPort();
  const config = join(workspace, 'postgrest.conf');
  await writeFile(config, `db-uri = "postgresql://authenticator@/postgres?host=${encodeURIComponent(socket)}"\ndb-schemas = "public"\ndb-extra-search-path = "public,extensions"\ndb-anon-role = "anon"\njwt-secret = "${jwtSecret}"\nserver-host = "127.0.0.1"\nserver-port = ${backendPort}\ndb-pool = 5\nlog-level = "warn"\n`, {mode: 0o600});
  let diagnostics = '';
  postgrest = spawn(join(postgrestRoot, 'postgrest'), [config], {env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe']});
  postgrest.stdout.on('data', b => {diagnostics += b;});
  postgrest.stderr.on('data', b => {diagnostics += b;});
  postgrestExit = new Promise((yes, no) => {postgrest.once('error', no); postgrest.once('exit', (code, signal) => yes({code, signal}));});
  postgrestExit.catch(() => {});
  const startedAt = Date.now();
  while (true) {
    lifecycleAbort.signal.throwIfAborted();
    assert.equal(postgrest.exitCode, null, `PostgREST exited before readiness: ${diagnostics}`);
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/rpc/list_friends`, {method: 'POST', headers: {Authorization: `Bearer ${jwt(actorA)}`, 'content-type': 'application/json'}, body: '{}', signal: AbortSignal.timeout(500)});
      assert.equal(response.status, 200, `PostgREST readiness HTTP ${response.status}: ${await response.text()}`);
      break;
    } catch (error) {
      if (Date.now() - startedAt > 6000) throw new Error(`PostgREST readiness failed: ${diagnostics}`, {cause: error});
      await new Promise(yes => setTimeout(yes, 25));
    }
  }
  // The actual SDK prefixes REST calls with /rest/v1. This loopback-only gateway
  // strips that path; no Auth/provider endpoint or synthetic RPC responses exist.
  gateway = createServer((incoming, outgoing) => {
    if (incoming.method === 'GET' && incoming.url === '/_analytify_friends_fixture') {
      outgoing.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({fixture: 'analytify-disposable-friends-http', nonce: fixtureNonce}));
      return;
    }
    if (!incoming.url.startsWith('/rest/v1/')) {outgoing.writeHead(404).end(); return;}
    const headers = {...incoming.headers}; delete headers.host;
    const upstream = httpRequest({hostname: '127.0.0.1', port: backendPort, path: incoming.url.slice('/rest/v1'.length), method: incoming.method, headers}, response => {
      if (dropNextRpcResponse && incoming.url.split('?')[0] === `/rest/v1/rpc/${dropNextRpcResponse}`) {
        dropNextRpcResponse = undefined;
        response.on('end', () => outgoing.destroy()); response.resume();
      } else {outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);}
    });
    upstream.on('error', () => {if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end();});
    incoming.on('aborted', () => upstream.destroy());
    incoming.pipe(upstream);
  });
  await new Promise((yes, no) => {gateway.once('error', no); gateway.listen(0, '127.0.0.1', yes);});
  const origin = `http://127.0.0.1:${gateway.address().port}`;
  const anonymousToken = jwt(undefined, {role: 'anon'});
  const clients = new Map();
  function client(subject, token = jwt(subject)) {
    const key = `${subject}:${token}`;
    if (!clients.has(key)) clients.set(key, createClient(origin, anonymousToken, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {headers: {Authorization: `Bearer ${token}`}, fetch: (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        assert.equal(url.origin, origin, 'Only the owned loopback gateway is permitted.');
        return fetch(input, {...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), lifecycleAbort.signal, AbortSignal.timeout(8000)])});
      }}
    }));
    return clients.get(key);
  }
  const rpc = async (actor, name, params = {}) => {
    const result = await client(actor).rpc(name, params);
    if(result.error) throw Object.assign(new Error(`${name}: ${JSON.stringify(result.error)}`), {code:result.error.code,status:result.status});
    return result.data;
  };
  const empty = await rpc(actorA, 'list_friends', {p_limit: 50, p_offset: 0});
  assert.deepEqual(empty, []);
  const ownProfile = await client(actorA).from('users').select('id');
  assert.equal(ownProfile.error, null);
  assert.deepEqual(ownProfile.data, [{id: actorA}]);
  assert.equal(await query("select rolsuper::text || ',' || rolinherit::text || ',' || rolcreatedb::text || ',' || rolcreaterole::text from pg_roles where rolname='authenticator'"), 'false,false,false,false');
  assert.equal(await query("select pg_has_role('authenticator','service_role','member')"),'f');
  outcomes.push('Real SDK HTTP RPC reaches PostgREST with a verified synthetic JWT actor; users RLS exposes only the actor profile.');
  if (!handshakeOnly) {
    const denied = async (sdk, name, params, code, status) => {
      const result = await sdk.rpc(name, params);
      assert(result.error, `${name} must be denied.`);
      if (code) assert.equal(result.error.code, code);
      if (status) assert.equal(result.status, status);
      return result;
    };
    await denied(client(undefined, anonymousToken), 'list_friends', {}, '42501', 401);
    await denied(client(undefined, jwt(undefined)), 'list_friends', {}, '42501', 403);
    await denied(client(unverified), 'list_friends', {}, '42501', 403);
    await denied(client(actorA, jwt(actorA, {}, 'untrusted-fixture-signing-key')), 'list_friends', {}, 'PGRST301', 401);
    await denied(client(actorA, jwt(actorA, {exp: Math.floor(Date.now() / 1000) - 60})), 'list_friends', {}, 'PGRST303', 401);
    const privateRead = await client(actorA).schema('private').from('friendships').select('*');
    assert(privateRead.error); assert.equal(privateRead.error.code, 'PGRST106');
    assert.equal(await query(`select has_table_privilege('authenticated','private.friendships','select')`), 'f');
    assert.equal(await query(`select has_table_privilege('authenticated','private.friend_invitations','select')`), 'f');
    outcomes.push('Signed anonymous/missing-actor/unverified/forged/expired JWT requests are denied with real HTTP/SQLSTATE codes; private schema is not exposed and raw table grants are absent.');

    const wrongProfileUpdate = await client(actorA).from('users').update({backup_active: true}).eq('id', actorB).select('id');
    assert.equal(wrongProfileUpdate.error, null); assert.deepEqual(wrongProfileUpdate.data, []);
    const ownUpdate = await client(actorA).from('users').update({backup_active: true}).eq('id', actorA).select('id,backup_active');
    assert.equal(ownUpdate.error, null); assert.deepEqual(ownUpdate.data, [{id: actorA, backup_active: true}]);
    assert.equal(await query(`select backup_active from public.users where id='${actorB}'`), 'f');
    const identityUpdate = await client(actorA).from('users').update({spotify_id: 'forbidden'}).eq('id', actorA);
    assert(identityUpdate.error); assert.equal(identityUpdate.error.code, '42501');
    outcomes.push('Real users table RLS allows the actor operational toggle, silently denies another actor row, and column grants reject identity replacement.');

    await query(`insert into public.stats_access_requests(owner_user_id,viewer_user_id,status) values('${actorA}','${actorB}','approved');
      insert into public.playlist_shares(owner_user_id,recipient_user_id,source_playlist_id,playlist_name,token_hash,snapshot_hash)
      values('${actorA}','${actorB}','synthetic-playlist','Synthetic share',repeat('b',64),repeat('c',64));`);
    const grantState = () => query(`select jsonb_build_object('stats',(select jsonb_agg(to_jsonb(s)) from public.stats_access_requests s),
      'playlists',(select jsonb_agg(to_jsonb(p)) from public.playlist_shares p))`);
    const originalGrants = await grantState();
    const sameGrants = async () => assert.equal(await grantState(), originalGrants);
    const create = (actor, token) => rpc(actor, 'create_friend_invitation', {p_claim_token: token});
    const receive = (actor, token) => rpc(actor, 'receive_friend_invitation', {p_claim_token: token});
    const respond = (actor, id, accept = true) => rpc(actor, 'respond_friend_request', {p_invitation_id: id, p_accept: accept});
    const list = actor => rpc(actor, 'list_friends', {p_limit: 50, p_offset: 0});
    const incoming = actor => rpc(actor, 'list_friend_requests', {p_limit: 50, p_offset: 0});
    const revoke = (actor, id) => rpc(actor, 'revoke_friend_invitation', {p_invitation_id: id});
    const remove = (actor, friend, version) => rpc(actor, 'remove_friend', {p_friend_user_id: friend, p_connection_version: version});
    const keys = (value, expected) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
    const token = 'a'.repeat(64);
    dropNextRpcResponse = 'create_friend_invitation';
    const lost = await client(actorA).rpc('create_friend_invitation', {p_claim_token: token});
    assert(lost.error, 'The loopback gateway must discard the committed response.');
    assert.equal(lost.status,0,'A discarded response is a network failure, not a database denial.');
    assert.equal(await query('select count(*) from private.friend_invitations'), '1');
    const created = await create(actorA, token);
    assert.deepEqual(await create(actorA, token), created);
    keys(created, ['id', 'status', 'createdAt']); assert.equal(created.status, 'pending');
    assert.equal(await query('select count(*) from private.friend_invitations'), '1');
    assert.notEqual(await query('select token_hash from private.friend_invitations'), token);
    for (const malformed of ['', 'a'.repeat(63), 'g'.repeat(64), null]) await denied(client(actorA), 'create_friend_invitation', {p_claim_token: malformed}, '22023', 400);
    await denied(client(actorB), 'create_friend_invitation', {p_claim_token: token}, '42501', 403);
    await denied(client(actorB), 'revoke_friend_invitation', {p_invitation_id: created.id}, '42501', 403);
    outcomes.push('Dropping a committed real HTTP creation response and retrying the same secret produces exactly one hashed pending invitation; malformed secrets/token takeover/non-owner revoke are rejected.');

    const received = await receive(actorB, token);
    keys(received, ['id', 'inviterUserId', 'displayName', 'imageUrl']);
    assert.equal(received.id, created.id); assert.equal(received.inviterUserId, actorA);
    assert.deepEqual(await receive(actorB, token), received);
    const requests = await incoming(actorB);
    assert.equal(requests.length, 1); keys(requests[0], ['requestId', 'inviterUserId', 'displayName', 'imageUrl', 'createdAt']);
    assert.equal(requests[0].requestId, created.id);
    assert.deepEqual(await incoming(actorA), []); assert.deepEqual(await incoming(actorC), []);
    assert.deepEqual(await list(actorA), []); assert.deepEqual(await list(actorB), []);
    await denied(client(actorC), 'receive_friend_invitation', {p_claim_token: token}, '22023', 400);
    await denied(client(actorC), 'respond_friend_request', {p_invitation_id: created.id, p_accept: true}, '22023', 400);
    outcomes.push('Receiving reserves exactly one recipient without friendship; exact incoming/preview DTOs contain no secret, and another actor cannot claim or answer the saved request.');

    const accepted = await respond(actorB, created.id);
    keys(accepted, ['id', 'status', 'isConnected']); assert.equal(accepted.status, 'accepted'); assert.equal(accepted.isConnected, true);
    assert.deepEqual(await respond(actorB, created.id), accepted);
    assert.deepEqual(await client(actorB).rpc('respond_friend_invitation', {p_claim_token: token, p_accept: true}).then(r => {assert.equal(r.error,null); return r.data;}), accepted);
    const friendsA = await list(actorA); const friendsB = await list(actorB);
    assert.equal(friendsA.length, 1); assert.equal(friendsB.length, 1);
    keys(friendsA[0], ['userId', 'displayName', 'imageUrl', 'connectedAt', 'connectionVersion']);
    assert.equal(friendsA[0].userId, actorB); assert.equal(friendsB[0].userId, actorA);
    assert.equal(friendsA[0].connectionVersion, friendsB[0].connectionVersion);
    assert.deepEqual(await incoming(actorB), []); await sameGrants();
    outcomes.push('Saved request acceptance and uncertain same-decision retries create one mutual versioned connection with exact Friends DTOs and preserve real independent Stats/playlist grants.');

    const oldVersion = friendsA[0].connectionVersion;
    await remove(actorA, actorB, oldVersion); await remove(actorA, actorB, oldVersion);
    assert.deepEqual(await list(actorA), []); assert.equal((await respond(actorB, created.id)).isConnected, false);
    const second = await create(actorA, 'd'.repeat(64)); await receive(actorB, 'd'.repeat(64)); await respond(actorB, second.id);
    const newVersion = (await list(actorA))[0].connectionVersion;
    assert.notEqual(newVersion, oldVersion);
    await remove(actorA, actorB, oldVersion); assert.equal((await list(actorA))[0].connectionVersion, newVersion);
    await remove(actorB, actorA, newVersion); assert.deepEqual(await list(actorA), []); await sameGrants();
    outcomes.push('Removal retries cannot revive old acceptance or remove a later reconnection; the other participant can remove the current version and independent grants remain byte-for-byte unchanged.');

    const revoked = await create(actorA, 'e'.repeat(64)); await receive(actorB, 'e'.repeat(64));
    await revoke(actorA, revoked.id); await revoke(actorA, revoked.id);
    assert.equal((await create(actorA, 'e'.repeat(64))).status, 'revoked');
    assert.deepEqual(await incoming(actorB), []);
    await denied(client(actorB), 'respond_friend_request', {p_invitation_id: revoked.id, p_accept: true}, '22023', 400);
    const declined = await create(actorA, 'f'.repeat(64)); await receive(actorB, 'f'.repeat(64));
    const no = await respond(actorB, declined.id, false); assert.equal(no.status, 'declined'); assert.equal(no.isConnected, false);
    assert.deepEqual(await respond(actorB, declined.id, false), no); assert.deepEqual(await incoming(actorB), []);
    await sameGrants();
    outcomes.push('Sender revocation and recipient decline remove incoming pending requests; both are replay-safe and prevent later acceptance.');

    const withInvitationLock = async (id, contenders, releaseSql = '') => {
      assert.match(id, /^[0-9a-f-]{36}$/);
      const holder = spawn(join(postgresRoot, 'usr/bin/psql'), ['-X','-qAt','-h',socket,'-U','analytify_test','-d','postgres','-v','ON_ERROR_STOP=1'], {env:runtimeEnv,stdio:['pipe','pipe','pipe']});
      let holderDiagnostics = '';
      holder.stderr.on('data', bytes => {holderDiagnostics += bytes;});
      const completed = new Promise((yes,no) => {holder.once('error',no); holder.once('exit',code => code===0 ? yes() : no(new Error(holderDiagnostics)));});
      completed.catch(()=>{});
      const ready = new Promise((yes,no) => {let output=''; holder.stdout.on('data',bytes=>{output+=bytes;if(output.includes('LOCK_READY'))yes();}); holder.once('error',no); holder.once('exit',()=>no(new Error('Lock holder exited before ready.')));});
      holder.stdin.write(`begin; select id from private.friend_invitations where id='${id}' for update;\n\\echo LOCK_READY\n`);
      let pending=[];
      try {
        await within(ready,3000,'Native lock readiness');
        pending=contenders.map(run=>run());
        const settled=Promise.allSettled(pending);
        const deadline=Date.now()+5000;
        while(Number(await query(`select count(*) from pg_stat_activity where usename='authenticator' and wait_event_type='Lock'`))!==contenders.length) {
          assert(Date.now()<deadline,'HTTP contenders did not reach native row-lock barrier.');
          await new Promise(yes=>setTimeout(yes,10));
        }
        holder.stdin.end(`${releaseSql} commit;\n\\q\n`);
        await within(completed,3000,'Native lock release');
        return await settled;
      } finally {
        if(holder.exitCode===null){
          if(!holder.stdin.writableEnded) holder.stdin.end('rollback;\n\\q\n');
          try {await within(completed,3000,'Native lock cleanup');}
          catch {holder.kill('SIGKILL'); await completed.catch(()=>{});}
        }
        await Promise.allSettled(pending);
      }
    };
    const receiveToken = '1'.repeat(64); const receiveRace = await create(actorA, receiveToken);
    const receivers = await withInvitationLock(receiveRace.id, [()=>receive(actorB,receiveToken),()=>receive(actorC,receiveToken)]);
    assert.equal(receivers.filter(r=>r.status==='fulfilled').length,1); assert.equal(receivers.filter(r=>r.status==='rejected').length,1);
    assert.equal(receivers.find(r=>r.status==='rejected').reason.code,'22023');
    assert.equal(receivers.find(r=>r.status==='rejected').reason.status,400);
    assert.equal((await incoming(actorB)).length+(await incoming(actorC)).length,1); await revoke(actorA,receiveRace.id);
    outcomes.push('Two actual HTTP/SDK receive requests observed waiting on a native row lock reserve exactly one recipient.');

    const acceptToken = '2'.repeat(64); const acceptRace = await create(actorA,acceptToken);
    const answers = await withInvitationLock(acceptRace.id,[
      ()=>rpc(actorB,'respond_friend_invitation',{p_claim_token:acceptToken,p_accept:true}),
      ()=>rpc(actorC,'respond_friend_invitation',{p_claim_token:acceptToken,p_accept:true})]);
    assert.equal(answers.filter(r=>r.status==='fulfilled').length,1); assert.equal(answers.filter(r=>r.status==='rejected').length,1);
    assert.equal(answers.find(r=>r.status==='rejected').reason.code,'22023');
    assert.equal(answers.find(r=>r.status==='rejected').reason.status,400);
    assert.equal(answers.find(r=>r.status==='fulfilled').value.isConnected,true); await sameGrants();
    outcomes.push('Two actual HTTP accept requests waiting on the same native invitation row produce one accepted recipient and one denied contender.');

    const revokeToken = '3'.repeat(64); const revokeRace = await create(actorA,revokeToken); await receive(actorB,revokeToken);
    const revokedAnswer = await withInvitationLock(revokeRace.id,[()=>respond(actorB,revokeRace.id)],
      `set local request.jwt.claims='${JSON.stringify({sub:actorA,role:'authenticated'})}'; set local role authenticated; select public.revoke_friend_invitation('${revokeRace.id}');`);
    assert.equal(revokedAnswer[0].status,'rejected');
    assert.equal(revokedAnswer[0].reason.code,'22023');
    assert.equal(revokedAnswer[0].reason.status,400);
    assert.equal(await query(`select status from private.friend_invitations where id='${revokeRace.id}'`),'revoked'); await sameGrants();
    outcomes.push('Owner revocation committed while actual HTTP acceptance waits prevents late acceptance and preserves independent grants.');

    for(const name of ['list_friends','list_friend_invitations','list_friend_requests']) for(const [limit,offset] of [[0,0],[101,0],[1,-1],[null,0]]) await denied(client(actorA),name,{p_limit:limit,p_offset:offset},'22023',400);
    const invites = await rpc(actorA,'list_friend_invitations',{p_limit:1,p_offset:1}); assert.equal(invites.length,1);
    keys(invites[0],['id','status','createdAt','respondedAt']);
    assert.deepEqual(await rpc(actorB,'list_friend_invitations',{p_limit:50,p_offset:0}),[]);
    await query(`update public.users set verified_spotify_id='synthetic-recovered' where id='${unverified}'`);
    assert.deepEqual(await rpc(unverified,'list_friends',{}),[]);
    outcomes.push('HTTP RPC pagination rejects invalid bounds, owner invitation DTOs omit secrets, and a previously denied synthetic actor recovers after the verified-profile prerequisite is established.');
  }
  if (angularContract) {
    const actors = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'];
    await query(`insert into auth.users(id) values ${actors.map(id => `('${id}')`).join(',')};
      update public.users set verified_spotify_id='angular-fixture-' || id::text where id in (${actors.map(id => `'${id}'`).join(',')});
      insert into public.stats_access_requests(owner_user_id,viewer_user_id,status) values('${actors[0]}','${actors[1]}','approved');
      insert into public.playlist_shares(owner_user_id,recipient_user_id,source_playlist_id,playlist_name,token_hash,snapshot_hash)
        values('${actors[0]}','${actors[1]}','angular-fixture-playlist','Angular synthetic share',repeat('8',64),repeat('9',64));`);
    const now = Math.floor(Date.now() / 1000);
    const context = {origin, fixtureNonce, anonToken: anonymousToken, actors: actors.map(id => ({id, session: {
      access_token: jwt(id), refresh_token: 'synthetic-unused-refresh', token_type: 'bearer', expires_in: 600, expires_at: now + 600,
      user: {id, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString()}
    }}))};
    const independentAngularGrants = () => query(`select jsonb_build_object(
      'stats',(select jsonb_agg(to_jsonb(s)) from public.stats_access_requests s where owner_user_id='${actors[0]}'),
      'playlists',(select jsonb_agg(to_jsonb(p)) from public.playlist_shares p where owner_user_id='${actors[0]}'))`);
    const grantsBeforeAngular = await independentAngularGrants();
    assert.equal(JSON.parse(grantsBeforeAngular).stats.length, 1);
    assert.equal(JSON.parse(grantsBeforeAngular).playlists.length, 1);
    const child = await execute(process.execPath, [join(repository, 'node_modules/@angular/cli/bin/ng.js'), 'test', '--watch=false', '--progress=false',
      '--ts-config=integration/friends-http/tsconfig.spec.json', `--include=${join(repository, 'integration/friends-http/friends-http.service.spec.ts')}`,
      '--runner-config=integration/friends-http/vitest.config.mjs'], {
      cwd: repository, env: {...process.env, ANALYTIFY_FRIEND_HTTP_CONTEXT: JSON.stringify(context)}, timeout: 90000, maxBuffer: 4 * 1024 * 1024,
      signal: lifecycleAbort.signal
    }).catch(error => {
      process.stdout.write(error.stdout || ''); process.stderr.write(error.stderr || ''); throw new Error('Angular Friends HTTP contract failed.', {cause: error});
    });
    process.stdout.write(child.stdout); process.stderr.write(child.stderr);
    assert.equal(await independentAngularGrants(), grantsBeforeAngular, 'Angular Friends workflows must preserve independent grants.');
    outcomes.push('Actual Angular FriendsService injection uses real cached SDK sessions and the same isolated HTTP/database stack; dedicated suite passed.');
  }
  evidence = {mode: handshakeOnly ? 'handshake-only' : angularContract ? 'selected-contract-and-angular' : 'selected-contract', versions: {postgres: postgresVersion, postgrest: postgrestVersion, supabaseJs: JSON.parse(await readFile(join(repository, 'node_modules/@supabase/supabase-js/package.json'))).version}, migrations, outcomes,
    isolation: {freshCluster: true, postgresTcp: false, socketPermissions: '0700', authenticatorNoInherit: true, authenticatorSuperuser: false, postgrestAndGatewayHost: '127.0.0.1', syntheticJwtProfilesOnly: true, externalDatabaseUrlAccepted: false},
    prerequisites: 'Local absolute PostgreSQL root and PostgREST directory. Explicit auth.users/auth.uid(JSON request.jwt.claims) and verified_spotify_id fixtures; selected actual migrations only.',
    limitations: `No hosted Auth login/token issuance/refresh/logout, Spotify OAuth/provider, Realtime, full retained migration chain, deployed backend compatibility, ${angularContract ? '' : 'Angular service injection, '}browser/UI parity or notification delivery is certified.`,
    runnerSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex')};
} catch (error) {
  console.error(await readFile(join(workspace, 'postgres.log'), 'utf8').catch(() => 'No PostgreSQL startup log was created.'));
  failure = error;
} finally {
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onInterrupt);
  lifecycleAbort.abort(new Error('Isolated contract cleanup.'));
  const cleanup = {};
  const cleanupErrors = [];
  const attempt = async (label, work) => {
    try {await work();}
    catch (error) {cleanupErrors.push(new Error(`${label}: ${error.message}`, {cause:error}));}
  };
  if (gateway) await attempt('Gateway cleanup', async () => {
    gateway.closeAllConnections();
    await within(new Promise((yes,no) => gateway.close(error => error ? no(error) : yes())),3000,'Gateway close');
    cleanup.gatewayClosed = true;
  });
  if (postgrest) await attempt('PostgREST cleanup', async () => {
    if (postgrest.exitCode === null && postgrest.signalCode === null) postgrest.kill('SIGTERM');
    try {await within(postgrestExit,3000,'PostgREST graceful shutdown');}
    catch {postgrest.kill('SIGKILL'); await within(postgrestExit,3000,'PostgREST forced shutdown');}
    cleanup.postgrestStopped = true;
  });
  let postgresStopped = !postgresAttempted;
  if (postgresAttempted) await attempt('PostgreSQL cleanup', async () => {
    const running = await commands('pg_ctl',['-D',data,'status']).then(() => true, error => {
      if(error.code===3) return false;
      throw error;
    });
    if(running) await commands('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await assert.rejects(commands('pg_ctl',['-D',data,'status']),error => error.code===3);
    postgresStopped = true;
    cleanup.postgresStopped = true;
  });
  if(postgresStopped) await attempt('Workspace cleanup', async () => {
    await rm(workspace, {recursive: true, force: true});
    cleanup.workspaceRemoved = true;
  });
  if (evidence) evidence.cleanup = cleanup;
  if(cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], 'Isolated contract cleanup failed.');
}
if (failure) throw failure;
if (process.env.ANALYTIFY_FRIEND_HTTP_EVIDENCE) await writeFile(resolve(process.env.ANALYTIFY_FRIEND_HTTP_EVIDENCE), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
