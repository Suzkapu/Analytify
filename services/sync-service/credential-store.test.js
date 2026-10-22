const test = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes} = require('crypto');

const {createCredentialStore} = require('./credential-store');

test('stores refresh tokens as AES-GCM ciphertext and decrypts them only in memory', async () => {
  const rows = new Map();
  const supabase = {
    from(table) {
      assert.equal(table, 'spotify_credentials');
      return {
        async upsert(row) { rows.set(row.user_id, {...row}); return {error: null}; },
        select() {
          return {
            eq(_column, userId) {
              return {async maybeSingle() { return {data: rows.get(userId) || null, error: null}; }};
            }
          };
        }
      };
    }
  };
  const store = createCredentialStore({
    supabase,
    encryptionKey: randomBytes(32).toString('base64')
  });

  await store.save('user-one', 'personal_pkce', '12345678901234567890123456789012', 'very-private-refresh-token');
  const persisted = rows.get('user-one');
  assert.ok(persisted.refresh_token_ciphertext);
  assert.notEqual(persisted.refresh_token_ciphertext, 'very-private-refresh-token');
  assert.equal(JSON.stringify(persisted).includes('very-private-refresh-token'), false);

  const credential = await store.get('user-one');
  assert.equal(credential.refreshToken, 'very-private-refresh-token');
  assert.equal(credential.connectionMode, 'personal_pkce');
});

test('removes encrypted and legacy refresh credentials together', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      return {
        delete() { return {async eq(column, value) {
          calls.push({table, operation: 'delete', column, value}); return {error: null};
        }}; },
        update(value) { return {async eq(column, id) {
          calls.push({table, operation: 'update', value, column, id}); return {error: null};
        }}; }
      };
    }
  };
  const store = createCredentialStore({supabase, encryptionKey: randomBytes(32).toString('base64')});

  await store.remove('user-one');

  assert.deepEqual(calls, [
    {table: 'spotify_credentials', operation: 'delete', column: 'user_id', value: 'user-one'},
    {table: 'users', operation: 'update', value: {spotify_refresh_token: null}, column: 'id', id: 'user-one'}
  ]);
});

function memoryCredentials(rows) {
  return {
    from(table) {
      assert.equal(table, 'spotify_credentials');
      return {
        async upsert(row) { rows.set(row.user_id, {...row}); return {error: null}; },
        select() {
          return {eq(_column, userId) {
            return {async maybeSingle() { return {data: rows.get(userId) || null, error: null}; }};
          }};
        }
      };
    }
  };
}

test('reads mixed key versions and writes only with the active version', async () => {
  const rows = new Map();
  const versionOne = randomBytes(32).toString('base64');
  const versionTwo = randomBytes(32).toString('base64');
  const oldStore = createCredentialStore({supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne}, writeKeyVersion: 1});
  await oldStore.save('old-user', 'hosted', null, 'old-token');

  const rotatingStore = createCredentialStore({
    supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne, 2: versionTwo}, writeKeyVersion: 2
  });
  await rotatingStore.save('new-user', 'hosted', null, 'new-token');

  assert.equal((await rotatingStore.get('old-user')).refreshToken, 'old-token');
  assert.equal((await rotatingStore.get('new-user')).refreshToken, 'new-token');
  assert.equal(rows.get('old-user').key_version, 1);
  assert.equal(rows.get('new-user').key_version, 2);
});

test('verifies a rotated credential before persistence and supports rollback', async () => {
  const rows = new Map();
  const versionOne = randomBytes(32).toString('base64');
  const versionTwo = randomBytes(32).toString('base64');
  const oldStore = createCredentialStore({supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne}, writeKeyVersion: 1});
  await oldStore.save('user', 'hosted', null, 'token');
  const original = {...rows.get('user')};
  const rotatingStore = createCredentialStore({
    supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne, 2: versionTwo}, writeKeyVersion: 2
  });

  const replacement = await rotatingStore.rotateCredential(original);
  assert.equal(replacement.previous_key_version, 1);
  assert.equal(replacement.key_version, 2);
  assert.deepEqual(rows.get('user'), original, 'rotation remains resumable until the verified replacement is persisted');
  assert.equal((await oldStore.get('user')).refreshToken, 'token', 'the previous release can still roll back before persistence');

  rows.set('user', {...original, ...replacement});
  assert.equal((await rotatingStore.get('user')).refreshToken, 'token');
});

test('fails closed for corrupt ciphertext and retired keys', async () => {
  const rows = new Map();
  const versionOne = randomBytes(32).toString('base64');
  const versionTwo = randomBytes(32).toString('base64');
  const oldStore = createCredentialStore({supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne}, writeKeyVersion: 1});
  await oldStore.save('user', 'hosted', null, 'token');

  const retiredStore = createCredentialStore({supabase: memoryCredentials(rows), encryptionKeys: {2: versionTwo}, writeKeyVersion: 2});
  await assert.rejects(() => retiredStore.get('user'), /unavailable encryption key version 1/);

  const mixedStore = createCredentialStore({
    supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne, 2: versionTwo}, writeKeyVersion: 2
  });
  rows.get('user').refresh_token_ciphertext = Buffer.from('corrupt').toString('base64');
  await assert.rejects(() => mixedStore.get('user'), /could not be decrypted/);
});

function rotationDatabase(rows) {
  const audits = [];
  let interruptNextUpdate = true;
  return {
    audits,
    supabase: {
      from(table) {
        if (table === 'spotify_credential_rotation_audit') {
          return {async insert(row) { audits.push({...row}); return {error: null}; }};
        }
        assert.equal(table, 'spotify_credentials');
        return {
          select() {
            const query = {
              neq(_column, version) { query.version = version; return query; },
              order() { return query; },
              async limit(limit) {
                return {data: [...rows.values()].filter(row => row.key_version !== query.version).slice(0, limit), error: null};
              }
            };
            return query;
          },
          update(replacement) {
            const filters = {};
            const query = {
              eq(column, value) { filters[column] = value; return query; },
              select() { return query; },
              async maybeSingle() {
                if (interruptNextUpdate) {
                  interruptNextUpdate = false;
                  return {data: null, error: null};
                }
                const row = rows.get(filters.user_id);
                if (!row || row.key_version !== filters.key_version) return {data: null, error: null};
                rows.set(filters.user_id, {...row, ...replacement});
                return {data: {user_id: filters.user_id}, error: null};
              }
            };
            return query;
          }
        };
      }
    }
  };
}

test('credential rotation is audited, resumable after interruption, and safe to retry', async () => {
  const rows = new Map();
  const versionOne = randomBytes(32).toString('base64');
  const versionTwo = randomBytes(32).toString('base64');
  const seed = createCredentialStore({supabase: memoryCredentials(rows), encryptionKeys: {1: versionOne}, writeKeyVersion: 1});
  await seed.save('user', 'hosted', null, 'token');
  const database = rotationDatabase(rows);
  const rotating = createCredentialStore({
    supabase: database.supabase,
    encryptionKeys: {1: versionOne, 2: versionTwo},
    writeKeyVersion: 2
  });

  assert.deepEqual(await rotating.rotatePending(), {examined: 1, rotated: 0, failed: 1});
  assert.equal(rows.get('user').key_version, 1, 'an interrupted compare-and-swap leaves the readable row intact');
  assert.equal(database.audits.at(-1).status, 'failed');

  assert.deepEqual(await rotating.rotatePending(), {examined: 1, rotated: 1, failed: 0});
  assert.equal(rows.get('user').key_version, 2);
  assert.equal(database.audits.at(-1).status, 'succeeded');
});

const {normalizeKeyRing}=require('./credential-store');
const key=Buffer.alloc(32,7).toString('base64');
function credentialHarness(options={}) {
 const rows=options.rows||new Map(),writes=[],audits=[];
 const supabase={from(table){const q={select(){return q;},eq(column,value){q[column]=value;return q;},not(){return Promise.resolve({data:options.legacyRows??null,error:options.listError});},neq(){return q;},order(){return q;},async limit(limit){writes.push({operation:'limit',limit});return {data:options.rotationRows??null,error:options.listError};},async maybeSingle(){if(q.replacement){if(options.updateThrown)throw options.updateThrown;return {data:{user_id:q.user_id},error:options.updateError};}return {data:rows.get(q.user_id)||null,error:options.readError};},async upsert(row){writes.push({operation:'save',row});if(!options.saveError)rows.set(row.user_id,{...row});return {error:options.saveError};},update(value){q.replacement=value;return table==='users'?{async eq(column,id){writes.push({operation:'clear',column,id,value});return {error:options.clearError};}}:q;},delete(){return {async eq(column,id){writes.push({operation:'delete',column,id});return {error:options.deleteError};}};},async insert(row){audits.push(row);return {error:options.auditError};}};return q;}};
 return {store:createCredentialStore({supabase,encryptionKeys:options.keys||{1:key},writeKeyVersion:options.writeVersion||1}),rows,writes,audits};
}
test('encryption key configuration rejects malformed versions, invalid lengths and absent active keys',()=>{
 for(const encryptionKeys of [{'0':key},{'1.5':key},{'1':2},{'-2':key}])assert.throws(()=>normalizeKeyRing({encryptionKeys}),/positive integers/);
 assert.throws(()=>normalizeKeyRing({encryptionKey:'bad'}),/32-byte/);assert.throws(()=>normalizeKeyRing({encryptionKeys:{1:key},writeKeyVersion:2}),/not present/);
 assert.equal(normalizeKeyRing({encryptionKey:key,encryptionKeys:{}}).writeVersion,1);
});
test('legacy migration encrypts before clearing plaintext and rotated refreshes persist for the same owner',async()=>{
 const h=credentialHarness();const credential=await h.store.get('owner','legacy-token');assert.deepEqual(h.writes.map(w=>w.operation),['save','clear']);assert.equal(credential.connectionMode,'hosted');assert.equal(credential.clientId,null);
 await credential.saveRefreshToken('new-token');assert.equal(credential.refreshToken,'new-token');assert.equal((await h.store.get('owner')).refreshToken,'new-token');assert.equal(h.rows.get('owner').client_id,null);assert.equal(await h.store.get('stranger'),null);
 await h.store.get('owner','stale-legacy');assert.equal(h.writes.at(-1).operation,'clear');
 h.rows.get('owner').key_version=undefined;assert.equal((await h.store.get('owner')).refreshToken,'new-token');assert.equal(await h.store.rotateCredential(h.rows.get('owner')),null);
});
test('refresh persistence failure preserves the in-memory refresh credential',async()=>{
 const rows=new Map();const initial=credentialHarness({rows});await initial.store.save('owner','personal_pkce','client','original');
 const h=credentialHarness({rows,saveError:new Error('save unavailable')});const credential=await h.store.get('owner');await assert.rejects(credential.saveRefreshToken('replacement'),/save unavailable/);assert.equal(credential.refreshToken,'original');
});
for(const scenario of ['read','save','clear','delete'])test(`credential ${scenario} failures surface before destructive follow-up`,async()=>{
 const failure=new Error(`${scenario} unavailable`);const h=credentialHarness({[`${scenario}Error`]:failure});
 if(scenario==='delete') {await assert.rejects(h.store.remove('owner'),/unavailable/);assert.equal(h.writes.some(w=>w.operation==='clear'),false);}
 else await assert.rejects(h.store.get('owner','legacy'),/unavailable/);
});
test('existing encrypted credential and remove both surface failed legacy cleanup',async()=>{
 const rows=new Map();await credentialHarness({rows}).store.save('owner','hosted',null,'token');const h=credentialHarness({rows,clearError:new Error('clear failed')});await assert.rejects(h.store.get('owner','legacy'),/clear failed/);await assert.rejects(h.store.remove('owner'),/clear failed/);
});
test('batch legacy migration handles empty results, multiple owners and query failure',async()=>{
 const h=credentialHarness({legacyRows:[{id:'first',spotify_refresh_token:'one'},{id:'second',spotify_refresh_token:'two'}]});assert.equal(await h.store.migrateAllLegacy(),2);assert.equal((await h.store.get('second')).refreshToken,'two');assert.equal(await credentialHarness().store.migrateAllLegacy(),0);await assert.rejects(credentialHarness({listError:new Error('list failed')}).store.migrateAllLegacy(),/list failed/);
});
test('rotation handles empty batches and bounded batch limits without mutations',async()=>{
 for(const [limit,expected] of [[0,25],[-1,1],[999,100]]){const h=credentialHarness();assert.deepEqual(await h.store.rotatePending(limit),{examined:0,rotated:0,failed:0});assert.equal(h.writes[0].limit,expected);}
 await assert.rejects(credentialHarness({listError:new Error('query failed')}).store.rotatePending(),/query failed/);
});
test('rotation audits persistence failures and non-Error exceptions without leaking ciphertext',async()=>{
 const rows=new Map();await credentialHarness({rows}).store.save('owner','hosted',null,'secret-fixture');
 for(const options of [{updateError:new Error('update failed')},{updateThrown:'unknown failure'}]){const h=credentialHarness({...options,rotationRows:[rows.get('owner')],keys:{1:key,2:Buffer.alloc(32,8).toString('base64')},writeVersion:2});assert.deepEqual(await h.store.rotatePending(),{examined:1,rotated:0,failed:1});assert.equal(h.audits[0].status,'failed');assert.equal(JSON.stringify(h.audits).includes('secret-fixture'),false);assert.match(h.audits[0].error_message,/update failed|Unknown credential/);}
 const h=credentialHarness({rotationRows:[rows.get('owner')]});assert.deepEqual(await h.store.rotatePending(),{examined:1,rotated:0,failed:0});assert.equal(h.audits.length,0);
 const failing=credentialHarness({rotationRows:[{...rows.get('owner'),key_version:99}],auditError:new Error('audit failed')});await assert.rejects(failing.store.rotatePending(),/audit failed/);
});
