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
