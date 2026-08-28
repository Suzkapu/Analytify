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

