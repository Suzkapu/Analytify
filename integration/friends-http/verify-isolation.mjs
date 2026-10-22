import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {promisify} from 'node:util';

const execute = promisify(execFile);
await assert.rejects(execute(process.execPath, ['scripts/test-isolated-friends-http-contract.mjs', 'postgresql://127.0.0.1/not-permitted']),
  error => error.stderr.includes('external connection arguments are forbidden'));

const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({fixture: 'analytify-disposable-friends-http', nonce: 'b'.repeat(64)}));
});
await new Promise((yes, no) => {server.once('error', no); server.listen(0, '127.0.0.1', yes);});
let wrongFixtureRejected = false;
try {
  const ids = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'];
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = id => {
    const prefix = `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({role: 'authenticated', sub: id, exp: now + 600})}`;
    return `${prefix}.${createHmac('sha256', 'negative-fixture-key').update(prefix).digest('base64url')}`;
  };
  const context = {origin: `http://127.0.0.1:${server.address().port}`, fixtureNonce: 'a'.repeat(64), anonToken: jwt(undefined), actors: ids.map(id => ({id, session: {
    access_token: jwt(id), refresh_token: 'synthetic-unused-refresh', token_type: 'bearer', expires_in: 600, expires_at: now + 600,
    user: {id, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString()}
  }}))};
  await assert.rejects(execute(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'test', '--watch=false', '--progress=false',
    '--ts-config=integration/friends-http/tsconfig.spec.json', `--include=${resolve('integration/friends-http/friends-http.service.spec.ts')}`,
    '--runner-config=integration/friends-http/vitest.config.mjs'], {env: {...process.env, ANALYTIFY_FRIEND_HTTP_CONTEXT: JSON.stringify(context)}, timeout: 90000}), error => {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    assert(output.includes('nonce'), 'The failure must identify the fixture challenge mismatch.');
    wrongFixtureRejected = true;
    return true;
  });
  assert.deepEqual(requests, ['/_analytify_friends_fixture'], 'A wrong fixture must receive no business RPC or Auth request.');
} finally {
  server.closeAllConnections();
  await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
}
const evidence = {externalDatabaseArgumentRejected: true, wrongFixtureRejected, requests, businessRequests: 0, databaseStarted: false};
if (process.env.ANALYTIFY_FRIEND_ISOLATION_EVIDENCE) await writeFile(process.env.ANALYTIFY_FRIEND_ISOLATION_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
