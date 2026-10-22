import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// Never accepts a database URL: every invocation owns a fresh socket-only cluster.
const execute = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.ANALYTIFY_TEST_POSTGRES_ROOT;
assert(runtime && runtime.startsWith('/'), 'Set ANALYTIFY_TEST_POSTGRES_ROOT to an extracted PostgreSQL runtime');
const workspace = await mkdtemp(join(tmpdir(), 'analytify-friends-contract-'));
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
  'supabase/migrations/20260801181500_playlist_sharing.sql',
  'supabase/migrations/20260902190000_stats_spy_mode.sql',
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
  await query(`alter table public.users add column verified_spotify_id text;
    insert into auth.users(id) values ('${actorA}'),('${actorB}'),('33333333-3333-4333-8333-333333333333');
    update public.users set verified_spotify_id='fixture-' || id::text;
  `);
  const friendshipMigration = 'supabase/migrations/20261011162823_design_v2_single_use_friend_invitations.sql';
  await commands('psql', ['-X','-h',socket,'-U','analytify_test','-d','postgres','-v','ON_ERROR_STOP=1','-f',join(repository,friendshipMigration)]);
  const actorC = '33333333-3333-4333-8333-333333333333';
  const rpc = async (actor, expression) => query(asActor(actor, `select ${expression}`));
  const create = async (actor, token) => JSON.parse(await rpc(actor, `public.create_friend_invitation('${token}')`));
  const respond = async (actor, token, accept = true) => JSON.parse(await rpc(actor, `public.respond_friend_invitation('${token}',${accept})`));
  const friends = async (actor) => JSON.parse(await rpc(actor, 'public.list_friends()'));
  const reject = async (promise, pattern) => assert.rejects(promise, error => pattern.test(error.stderr));
  const token = 'a'.repeat(64);
  const created = await create(actorA, token);
  assert.equal(created.status, 'pending');
  assert.deepEqual(await create(actorA, token), created);
  assert.equal(await query('select count(*) from private.friend_invitations'), '1');
  assert.notEqual(await query('select token_hash from private.friend_invitations'), token);
  outcomes.push('Creation and lost-response retry produce one pending invitation with a hashed secret');
  for (const bad of [null, '', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(65)]) {
    await reject(rpc(actorA, `public.create_friend_invitation(${bad === null ? 'null' : `'${bad}'`})`), /secure invitation token/);
  }
  await reject(create(actorB, token), /unavailable/);
  await reject(query(`set role anon; select public.create_friend_invitation('${token}')`), /permission denied/);
  await reject(query(`set role authenticated; select public.list_friends()`), /Authentication is required/);
  await query(`update public.users set verified_spotify_id=null where id='${actorC}'`);
  await reject(rpc(actorC, 'public.list_friends()'), /verified Spotify profile/);
  await query(`update public.users set verified_spotify_id='fixture-c' where id='${actorC}'`);
  outcomes.push('Malformed tokens, anonymous/missing actors, unverified profiles and token takeover are rejected');
  const preview = JSON.parse(await rpc(actorB, `public.preview_friend_invitation('${token}')`));
  assert.equal(preview.inviterUserId, actorA);
  assert.deepEqual(Object.keys(preview).sort(), ['displayName','id','imageUrl','inviterUserId']);
  assert.deepEqual(await friends(actorB), []);
  await reject(rpc(actorA, `public.preview_friend_invitation('${token}')`), /unavailable/);
  await reject(respond(actorA, token), /unavailable/);
  await reject(rpc(actorB, `public.respond_friend_invitation('${token}',null)`), /valid invitation decision/);
  await reject(rpc(actorB, `public.revoke_friend_invitation('${created.id}')`), /unavailable/);
  await reject(query(`set role authenticated; select * from private.friend_invitations`), /permission denied/);
  await reject(query(`set role authenticated; select * from private.friendships`), /permission denied/);
  outcomes.push('Read-only preview exposes only inviter presentation; self response, non-owner revoke and raw table access are denied');
  // These are real existing grant tables, not lookalike fixtures.
  await query(`insert into public.stats_access_requests(owner_user_id,viewer_user_id,status)
      values('${actorA}','${actorB}','approved');
    insert into public.playlist_shares(owner_user_id,recipient_user_id,source_playlist_id,playlist_name,token_hash,snapshot_hash)
      values('${actorA}','${actorB}','fixture-playlist','Synthetic share',repeat('b',64),repeat('c',64));`);
  const grants = () => query(`select jsonb_build_object('stats',(select jsonb_agg(to_jsonb(s)) from public.stats_access_requests s),
    'playlists',(select jsonb_agg(to_jsonb(p)) from public.playlist_shares p))`);
  const originalGrants = await grants();
  const accepted = await respond(actorB, token);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.isConnected, true);
  assert.deepEqual(await respond(actorB, token), accepted);
  assert.equal(await query('select count(*) from private.friendships'), '1');
  assert.equal((await friends(actorA))[0].userId, actorB);
  assert.equal((await friends(actorB))[0].userId, actorA);
  assert.deepEqual(await friends(actorC), []);
  await reject(respond(actorC, token), /already been answered/);
  await reject(respond(actorB, token, false), /already been answered/);
  await reject(rpc(actorC, `public.preview_friend_invitation('${token}')`), /unavailable/);
  outcomes.push('Acceptance creates one mutual connection, consumes the link and safely replays only the same decision/recipient');
  await rpc(actorA, `public.revoke_friend_invitation('${created.id}')`);
  assert.equal((await friends(actorA)).length, 1);
  const originalConnectionVersion = (await friends(actorA))[0].connectionVersion;
  await rpc(actorC, `public.remove_friend('${actorA}','${originalConnectionVersion}')`);
  assert.equal((await friends(actorA)).length, 1);
  await rpc(actorA, `public.remove_friend('${actorB}','${originalConnectionVersion}')`);
  await rpc(actorA, `public.remove_friend('${actorB}','${originalConnectionVersion}')`);
  assert.deepEqual(await friends(actorA), []);
  assert.deepEqual(await friends(actorB), []);
  assert.equal((await respond(actorB, token)).isConnected, false);
  assert.deepEqual(await friends(actorA), []);
  assert.equal(await grants(), originalGrants);
  outcomes.push('Either participant can remove; unrelated removal and old acceptance replay cannot restore membership or alter existing grants');
  const nextToken = 'd'.repeat(64);
  await create(actorA, nextToken);
  assert.equal((await respond(actorB, nextToken)).isConnected, true);
  assert.equal(await query('select count(*) from private.friendships'), '1');
  const nextConnectionVersion = (await friends(actorA))[0].connectionVersion;
  assert.notEqual(nextConnectionVersion, originalConnectionVersion);
  await rpc(actorA, `public.remove_friend('${actorB}','${originalConnectionVersion}')`);
  assert.equal((await friends(actorA)).length, 1, 'An old removal retry must preserve a later reconnection');
  await rpc(actorB, `public.remove_friend('${actorA}','${nextConnectionVersion}')`);
  assert.deepEqual(await friends(actorA), []);
  outcomes.push('A genuinely new invitation reconnects without duplicates; the other participant can remove too');
  const revokedToken = 'e'.repeat(64);
  const revoked = await create(actorA, revokedToken);
  await rpc(actorA, `public.revoke_friend_invitation('${revoked.id}')`);
  await rpc(actorA, `public.revoke_friend_invitation('${revoked.id}')`);
  assert.equal((await create(actorA, revokedToken)).status, 'revoked');
  await reject(respond(actorB, revokedToken), /unavailable/);
  await reject(rpc(actorB, `public.preview_friend_invitation('${revokedToken}')`), /unavailable/);
  const declinedToken = 'f'.repeat(64);
  await create(actorA, declinedToken);
  const declined = await respond(actorB, declinedToken, false);
  assert.equal(declined.status, 'declined');
  assert.equal(declined.isConnected, false);
  assert.deepEqual(await respond(actorB, declinedToken, false), declined);
  await reject(respond(actorC, declinedToken), /already been answered/);
  outcomes.push('Revoked requests stay revoked across creation retry; a declined single-use invitation cannot create a friendship');
  for (const args of ['0,0','101,0','null,0','1,-1','1,null']) {
    await reject(rpc(actorA, `public.list_friends(${args})`), /Invalid friends page/);
    await reject(rpc(actorA, `public.list_friend_invitations(${args})`), /Invalid invitation page/);
  }
  const owned = JSON.parse(await rpc(actorA, 'public.list_friend_invitations()'));
  assert.equal(owned.length, 4);
  assert.deepEqual(JSON.parse(await rpc(actorB, 'public.list_friend_invitations()')), []);
  assert.equal(JSON.parse(await rpc(actorA, 'public.list_friend_invitations(1,1)')).length, 1);
  assert(owned.every(row => !('token_hash' in row) && !('claimToken' in row)));
  outcomes.push('Bounded owner-only invitation pages contain no bearer token or token hash');
  // Use a real row lock as the barrier, then observe native lock waits before release.
  const withInvitationLock = async (id, waitingNames, contenders, releaseSql, table = 'friend_invitations') => {
    assert(['friend_invitations','friendships'].includes(table));
    const holder = spawn(join(runtime,'usr/bin/psql'), ['-X','-qAt','-h',socket,'-U','analytify_test','-d','postgres','-v','ON_ERROR_STOP=1'], {env,stdio:['pipe','pipe','pipe']});
    let diagnostics = '';
    holder.stderr.on('data', bytes => { diagnostics += bytes; });
    const completed = new Promise((resolve,reject) => {
      holder.once('error', reject);
      holder.once('exit', code => code === 0 ? resolve() : reject(new Error(diagnostics)));
    });
    completed.catch(() => {});
    const ready = new Promise((resolve,reject) => {
      let output = '';
      holder.stdout.on('data', bytes => { output += bytes; if(output.includes('LOCK_READY')) resolve(); });
      holder.once('exit', () => reject(new Error('Lock holder exited before ready: '+diagnostics)));
      holder.once('error', reject);
    });
    holder.stdin.write(`begin; select id from private.${table} where id='${id}' for update;\n\\echo LOCK_READY\n`);
    let pending = [];
    try {
      await ready;
      pending = contenders.map(fn => fn());
      const settled = Promise.allSettled(pending);
      const deadline = Date.now()+5000;
      while (Number(await query(`select count(*) from pg_stat_activity where application_name in (${waitingNames.map(x=>`'${x}'`).join(',')}) and wait_event_type='Lock'`)) !== waitingNames.length) {
        if(Date.now() > deadline) throw new Error('Contenders did not reach the native row-lock barrier');
        await new Promise(resolve => setTimeout(resolve,10));
      }
      holder.stdin.write(`${releaseSql} commit;\n\\q\n`);
      await completed;
      return await settled;
    } finally {
      if(holder.exitCode === null) { holder.stdin.end('rollback;\n\\q\n'); await completed; }
      await Promise.allSettled(pending);
    }
  };
  const racedToken = '1'.repeat(64);
  const raced = await create(actorA, racedToken);
  const contest = await withInvitationLock(raced.id, ['friend-b','friend-c'], [
    () => query(`set application_name='friend-b'; ${asActor(actorB, `select public.respond_friend_invitation('${racedToken}',true)`)}`),
    () => query(`set application_name='friend-c'; ${asActor(actorC, `select public.respond_friend_invitation('${racedToken}',true)`)}`),
  ], '');
  assert.equal(contest.filter(result=>result.status==='fulfilled').length, 1);
  assert.equal(contest.filter(result=>result.status==='rejected').length, 1);
  const winner = JSON.parse(contest.find(result=>result.status==='fulfilled').value);
  assert.equal(winner.isConnected, true);
  assert.equal((await friends(actorA)).length, 1);
  outcomes.push('Two native sessions waiting on one invitation yield exactly one accepted recipient');
  const revokeRaceToken = '2'.repeat(64);
  const revokeRace = await create(actorA, revokeRaceToken);
  const revokeContest = await withInvitationLock(revokeRace.id, ['friend-after-revoke'], [
    () => query(`set application_name='friend-after-revoke'; ${asActor(actorB, `select public.respond_friend_invitation('${revokeRaceToken}',true)`)}`),
  ], `set request.jwt.claim.sub='${actorA}'; set role authenticated; select public.revoke_friend_invitation('${revokeRace.id}');`);
  assert.equal(revokeContest[0].status, 'rejected');
  assert.match(revokeContest[0].reason.stderr,/unavailable/);
  assert.equal(await query(`select status from private.friend_invitations where id='${revokeRace.id}'`), 'revoked');
  assert.equal(await grants(), originalGrants);
  outcomes.push('Revocation committed while acceptance waits prevents acceptance and preserves real independent grants');
  const retryToken = '3'.repeat(64);
  await create(actorA,retryToken);
  const duplicates = await Promise.all([respond(actorB,retryToken),respond(actorB,retryToken)]);
  assert.deepEqual(duplicates[0],duplicates[1]);
  const acceptedFirstToken = '4'.repeat(64);
  const acceptedFirst = await create(actorA,acceptedFirstToken);
  const afterAcceptance = await withInvitationLock(acceptedFirst.id,['friend-revoke-after-accept'],[
    () => query(`set application_name='friend-revoke-after-accept'; ${asActor(actorA, `select public.revoke_friend_invitation('${acceptedFirst.id}')`)}`),
  ], `set request.jwt.claim.sub='${actorB}'; set role authenticated; select public.respond_friend_invitation('${acceptedFirstToken}',true);`);
  assert.equal(afterAcceptance[0].status,'fulfilled');
  assert.equal(await query(`select status from private.friend_invitations where id='${acceptedFirst.id}'`),'accepted');
  assert((await friends(actorA)).some(row=>row.userId===actorB));
  outcomes.push('Concurrent same-recipient retries agree; revocation after committed acceptance leaves the friendship intact');
  const beforeRemoval = (await friends(actorA)).find(row=>row.userId===actorB);
  await reject(rpc(actorA,`public.remove_friend('${actorB}',null)`),/connection version is required/);
  await rpc(actorA,`public.remove_friend('${actorB}','${beforeRemoval.connectionVersion}')`);
  const reconnectToken = 'c'.repeat(64);
  await create(actorA,reconnectToken);
  const connectionId = await query(`select id from private.friendships where lower_user_id=least('${actorA}'::uuid,'${actorB}'::uuid) and upper_user_id=greatest('${actorA}'::uuid,'${actorB}'::uuid)`);
  const delayedRemoval = await withInvitationLock(connectionId,['old-friend-removal'],[
    () => query(`set application_name='old-friend-removal'; ${asActor(actorA,`select public.remove_friend('${actorB}','${beforeRemoval.connectionVersion}')`)}`),
  ],`set request.jwt.claim.sub='${actorB}'; set role authenticated; select public.respond_friend_invitation('${reconnectToken}',true);`,'friendships');
  assert.equal(delayedRemoval[0].status,'fulfilled');
  const reconnected = (await friends(actorA)).find(row=>row.userId===actorB);
  assert(reconnected,'A removal waiting on reconnection must preserve the new connection');
  assert.notEqual(reconnected.connectionVersion,beforeRemoval.connectionVersion);
  await respond(actorB,reconnectToken);
  assert.equal((await friends(actorA)).find(row=>row.userId===actorB).connectionVersion,reconnected.connectionVersion);
  assert.equal(await grants(),originalGrants);
  outcomes.push('A version-bound removal waiting on a real row lock preserves a later reconnection; acceptance retry retains the connection version');
  const rollbackToken = '5'.repeat(64);
  const rollbackInvite = await create(actorA,rollbackToken);
  await reject(query(asActor(actorB, `begin; select public.respond_friend_invitation('${rollbackToken}',true); select 1/0; commit;`)),/division by zero/);
  assert.equal(await query(`select status from private.friend_invitations where id='${rollbackInvite.id}'`),'pending');
  assert.equal((await respond(actorB,rollbackToken)).isConnected,true);
  assert.equal(await grants(),originalGrants);
  outcomes.push('A real transaction failure rolls back invitation consumption and allows successful recovery');
  const quotaTokens = Array.from({length:20},(_,i)=>(i+100).toString(16).padStart(64,'0'));
  await Promise.all(quotaTokens.map(value=>create(actorC,value)));
  await reject(create(actorC,'6'.repeat(64)),/Revoke a pending invitation/);
  const quotaList = JSON.parse(await rpc(actorC,'public.list_friend_invitations()'));
  assert.equal(quotaList.filter(row=>row.status==='pending').length,20);
  await rpc(actorC,`public.revoke_friend_invitation('${quotaList[0].id}')`);
  assert.equal((await create(actorC,'6'.repeat(64))).status,'pending');
  assert.equal(JSON.parse(await rpc(actorC,'public.list_friend_invitations()')).filter(row=>row.status==='pending').length,20);
  outcomes.push('Concurrent creation respects the 20-pending-request bound; revocation releases capacity without restoring old tokens');
  const incoming = async actor => JSON.parse(await rpc(actor,'public.list_friend_requests()'));
  const receive = async (actor,value) => JSON.parse(await rpc(actor,`public.receive_friend_invitation('${value}')`));
  const answerRequest = async (actor,id,accept=true) => JSON.parse(await rpc(actor,`public.respond_friend_request('${id}',${accept})`));
  const pendingToken = '7'.repeat(64);
  const pendingInvite = await create(actorA,pendingToken);
  const beforeReceive = await friends(actorB);
  const received = await receive(actorB,pendingToken);
  assert.equal(received.id,pendingInvite.id);
  assert.deepEqual(await receive(actorB,pendingToken),received);
  assert.deepEqual(await friends(actorB),beforeReceive);
  const requests = await incoming(actorB);
  assert.equal(requests.length,1);
  assert.equal(requests[0].requestId,pendingInvite.id);
  assert.equal(requests[0].inviterUserId,actorA);
  assert.deepEqual(Object.keys(requests[0]).sort(),['createdAt','displayName','imageUrl','inviterUserId','requestId']);
  assert.deepEqual(await incoming(actorA),[]);
  assert.deepEqual(await incoming(actorC),[]);
  await reject(receive(actorC,pendingToken),/unavailable/);
  await reject(rpc(actorC,`public.preview_friend_invitation('${pendingToken}')`),/unavailable/);
  await reject(respond(actorC,pendingToken),/unavailable/);
  await reject(answerRequest(actorC,pendingInvite.id),/unavailable/);
  const requestAccepted = await answerRequest(actorB,pendingInvite.id);
  assert.equal(requestAccepted.status,'accepted');
  assert.equal(requestAccepted.isConnected,true);
  assert.deepEqual(await answerRequest(actorB,pendingInvite.id),requestAccepted);
  assert.deepEqual(await respond(actorB,pendingToken),requestAccepted);
  assert.deepEqual(await incoming(actorB),[]);
  assert.equal(await grants(),originalGrants);
  outcomes.push('Receiving reserves one recipient without friendship; its saved incoming request can be accepted/retried by ID without the bearer secret');
  const incomingDeclineToken = '8'.repeat(64);
  const incomingDecline = await create(actorA,incomingDeclineToken);
  await receive(actorB,incomingDeclineToken);
  assert.equal((await answerRequest(actorB,incomingDecline.id,false)).status,'declined');
  assert.deepEqual(await incoming(actorB),[]);
  const incomingRevokeToken = '9'.repeat(64);
  const incomingRevoke = await create(actorA,incomingRevokeToken);
  await receive(actorB,incomingRevokeToken);
  await rpc(actorA,`public.revoke_friend_invitation('${incomingRevoke.id}')`);
  assert.deepEqual(await incoming(actorB),[]);
  await reject(answerRequest(actorB,incomingRevoke.id),/unavailable/);
  await reject(receive(actorB,incomingRevokeToken),/unavailable/);
  outcomes.push('Declining or sender revocation removes the delivered pending request and prevents later acceptance');
  const receiveRaceToken = '0'.repeat(64);
  const receiveRace = await create(actorA,receiveRaceToken);
  const receivers = await withInvitationLock(receiveRace.id,['friend-receive-b','friend-receive-c'],[
    () => query(`set application_name='friend-receive-b'; ${asActor(actorB,`select public.receive_friend_invitation('${receiveRaceToken}')`)}`),
    () => query(`set application_name='friend-receive-c'; ${asActor(actorC,`select public.receive_friend_invitation('${receiveRaceToken}')`)}`),
  ],'');
  assert.equal(receivers.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(receivers.filter(result=>result.status==='rejected').length,1);
  assert.equal((await incoming(actorB)).length+(await incoming(actorC)).length,1);
  await rpc(actorA,`public.revoke_friend_invitation('${receiveRace.id}')`);
  for(const args of ['0,0','101,0','null,0','1,-1','1,null']) await reject(rpc(actorB,`public.list_friend_requests(${args})`),/Invalid request page/);
  await reject(query('set role anon; select public.list_friend_requests()'),/permission denied/);
  outcomes.push('Two native receiving sessions reserve exactly one recipient; incoming listings enforce bounded pages and anonymous denial');
  const eraseToken = 'b'.repeat(64);
  const eraseRequest = await create(actorA,eraseToken);
  await receive(actorC,eraseToken);
  await query(`delete from public.users where id='${actorC}'`);
  assert.equal(await query(`select count(*) from private.friend_invitations where owner_user_id='${actorC}' or responded_by_user_id='${actorC}' or recipient_user_id='${actorC}'`),'0');
  assert.equal(await query(`select count(*) from private.friendships where lower_user_id='${actorC}' or upper_user_id='${actorC}'`),'0');
  assert.equal(await query(`select count(*) from public.users where id in ('${actorA}','${actorB}')`),'2');
  assert.equal(await grants(),originalGrants);
  outcomes.push('Deleting a related profile cascades its private invitation/membership rows and leaves unrelated profiles/grants intact');
  const evidence = {
    runnerSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    version,isolation:{freshCluster:true,tcpListeners:false,socketPermissions:'0700',syntheticProfilesOnly:true},
    migrations:[...migrations,{path:friendshipMigration,sha256:createHash('sha256').update(await readFile(join(repository,friendshipMigration))).digest('hex')}],
    outcomes,
    limitations:'Selected native SQL contracts. Auth users/uid and verified-profile column are explicit prerequisites; no hosted JWT/Auth, PostgREST, full migration chain, hosted delivery/transport, Angular route or UI parity is certified.',
  };
  if(process.env.ANALYTIFY_FRIEND_CONTRACT_EVIDENCE) await writeFile(resolve(process.env.ANALYTIFY_FRIEND_CONTRACT_EVIDENCE),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} catch (error) {
  console.error(await readFile(join(workspace, 'postgres.log'), 'utf8').catch(() => 'No PostgreSQL server log was created.'));
  throw error;
} finally {
  if (started) await commands('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  await rm(workspace, { recursive: true, force: true });
}
