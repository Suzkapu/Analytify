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
