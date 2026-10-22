const test = require('node:test');
const assert = require('node:assert/strict');
const {createSpotifyClient, retryAfterMilliseconds} = require('./spotify-client');

const response = (status, body = '', headers = {}) => ({status, ok: status >= 200 && status < 300, statusText: '',
  headers: {get: name => headers[name.toLowerCase()] || null}, text: async () => body});

test('honors Retry-After and retries transient idempotent requests', async () => {
  const waits = [], replies = [response(429, 'slow down', {'retry-after': '2'}), response(200, '{"ok":true}')];
  const client = createSpotifyClient({}, {fetch: async () => replies.shift(), sleep: async ms => waits.push(ms), now: () => 0});
  assert.deepEqual(await client.request('https://api.spotify.com/v1/me'), {ok: true});
  assert.deepEqual(waits, [2000]);
});

test('does not retry unsafe Spotify side effects by default', async () => {
  let calls = 0;
  const client = createSpotifyClient({}, {fetch: async () => { calls++; return response(503, 'down'); }});
  await assert.rejects(client.request('https://api.spotify.com/v1/playlists/x/items', {method: 'POST'}), error => error.kind === 'transient');
  assert.equal(calls, 1);
});

test('stops before a retry would exceed the elapsed budget', async () => {
  const client = createSpotifyClient({spotifyRetryBudgetMs: 100}, {fetch: async () => response(503, 'down'), random: () => 0, now: () => 0});
  await assert.rejects(client.request('https://api.spotify.com/v1/me'), error => error.kind === 'retry_exhausted');
});

test('classifies a deadline abort as a timeout', async () => {
  const client = createSpotifyClient({spotifyRequestTimeoutMs: 5, spotifyMaxAttempts: 1}, {
    fetch: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))
  });
  await assert.rejects(client.request('https://api.spotify.com/v1/me'), error => error.kind === 'timeout');
});

test('does not start a request after caller cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  const client = createSpotifyClient({}, {fetch: async () => { throw new Error('must not run'); }});
  await assert.rejects(client.request('https://api.spotify.com/v1/me', {signal: controller.signal}), error => error.kind === 'cancelled');
});

test('parses seconds and dates from Retry-After', () => {
  assert.equal(retryAfterMilliseconds('3', 0), 3000);
  assert.equal(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:04 GMT', 1000), 3000);
});

test('refreshes a personal-app credential with its public client ID and no client secret', async () => {
  let requestBody = '';
  const saveRefreshToken = test.mock.fn();
  const client = createSpotifyClient({
    spotifyClientId: 'hosted-client',
    spotifyClientSecret: 'must-not-leak'
  }, {
    fetch: async (_url, options) => {
      requestBody = String(options.body || '');
      return response(200, JSON.stringify({access_token: 'personal-access', refresh_token: 'rotated-refresh'}));
    }
  });

  const token = await client.accessToken({
    connectionMode: 'personal_pkce',
    clientId: '12345678901234567890123456789012',
    refreshToken: 'personal-refresh',
    saveRefreshToken
  });

  assert.equal(token, 'personal-access');
  assert.match(requestBody, /client_id=12345678901234567890123456789012/);
  assert.doesNotMatch(requestBody, /client_secret|must-not-leak/);
  assert.equal(saveRefreshToken.mock.callCount(), 1);
  assert.equal(saveRefreshToken.mock.calls[0].arguments[0], 'rotated-refresh');
});

test('classifies invalid_grant refresh responses as terminal credentials without retrying', async () => {
  let calls = 0;
  const client = createSpotifyClient({spotifyClientId: 'hosted', spotifyClientSecret: 'secret'}, {
    fetch: async () => {
      calls += 1;
      return response(400, JSON.stringify({error: 'invalid_grant', error_description: 'Refresh token revoked'}));
    }
  });

  await assert.rejects(client.accessToken({
    connectionMode: 'hosted', refreshToken: 'expired', saveRefreshToken: async () => {}
  }), error => error.kind === 'credential_invalid');
  assert.equal(calls, 1);
});

const {ExternalRequestError,spotifyErrorCode}=require('./spotify-client');
test('error parsers reject malformed responses and clamp invalid retry values',()=>{
 assert.equal(spotifyErrorCode(''),null);assert.equal(spotifyErrorCode('{'),null);assert.equal(spotifyErrorCode('{"error":{}}'),null);assert.equal(spotifyErrorCode('{"error":"invalid_grant"}'),'invalid_grant');
 assert.equal(retryAfterMilliseconds(null),null);assert.equal(retryAfterMilliseconds('invalid'),null);assert.equal(retryAfterMilliseconds('-2'),0);assert.equal(retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:00 GMT',1000),0);assert.equal(new ExternalRequestError('fixture').kind,'permanent');
});
test('hosted token refresh uses hosted credentials and rejects absent access tokens',async()=>{
 let body;
 const client=createSpotifyClient({spotifyClientId:'hosted',spotifyClientSecret:'test-secret'},{fetch:async(url,options)=>{body=new URLSearchParams(options.body);return response(200,'{"access_token":"access","refresh_token":"unchanged"}');}});
 assert.equal(await client.accessToken({refreshToken:'unchanged'}),'access');assert.equal(body.get('client_secret'),'test-secret');
 await assert.rejects(client.accessToken(null),/credential is missing/);
 await assert.rejects(createSpotifyClient({}).accessToken({refreshToken:'fixture'}),/Client ID is missing/);
 for(const reply of ['','{}','null']){const empty=createSpotifyClient({spotifyClientId:'hosted'},{fetch:async()=>response(200,reply)});await assert.rejects(empty.accessToken({refreshToken:'fixture'}),/did not return an access token/);}
});
test('external cancellation during fetch aborts the active request without retrying',async()=>{
 const controller=new AbortController();let attempts=0;
 const client=createSpotifyClient({}, {fetch:async(url,options)=>{attempts++;controller.abort('stop');throw options.signal.reason;}});
 await assert.rejects(client.api('/me','fixture',{signal:controller.signal}),error=>error.kind==='cancelled');assert.equal(attempts,1);
});
test('cancellation during retry delay prevents another request',async()=>{
 const controller=new AbortController();let attempts=0;
 const client=createSpotifyClient({}, {fetch:async()=>{attempts++;throw 'offline';},sleep:async()=>controller.abort(),random:()=>0});
 await assert.rejects(client.request('https://fixture.invalid',{signal:controller.signal}),error=>error.kind==='cancelled');assert.equal(attempts,1);
});
test('transient transport errors retry boundedly and a final HTTP error preserves status',async()=>{
 let attempts=0;const waits=[];const client=createSpotifyClient({spotifyMaxAttempts:2},{fetch:async()=>{attempts++;throw new Error('offline');},sleep:async ms=>waits.push(ms),random:()=>0,now:()=>0});
 await assert.rejects(client.request('https://fixture.invalid'),error=>error.kind==='transient'&&/offline/.test(error.message));assert.equal(attempts,2);assert.deepEqual(waits,[375]);
 const http=createSpotifyClient({spotifyMaxAttempts:2},{fetch:async()=>response(503,''),sleep:async()=>{},now:()=>0});await assert.rejects(http.request('https://fixture.invalid'),error=>error.status===503);
 const malformed=createSpotifyClient({}, {fetch:async()=>response(400,'malformed')});await assert.rejects(malformed.request('https://accounts.spotify.com/api/token'),error=>error.kind==='permanent');
});
test('default sleep and random recover from a transient response and API headers preserve overrides',async t=>{
 let attempts=0,headers;const timeout=t.mock.method(global,'setTimeout',(fn,ms)=>{if(ms!==15000)queueMicrotask(fn);return 1;});t.mock.method(global,'clearTimeout',()=>{});
 const client=createSpotifyClient({}, {fetch:async(url,opts)=>{headers=opts.headers;return response(++attempts===1?503:200,'');}});
 assert.equal(await client.api('/me','test',{headers:{'Content-Type':'custom'}}),null);assert.equal(headers.Authorization,'Bearer test');assert.equal(headers['Content-Type'],'custom');assert.match(headers['Accept-Language'],/en-GB/);assert.equal(attempts,2);
});
