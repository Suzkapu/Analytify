import assert from 'node:assert/strict';
import {boundedFetch, BoundedFetchError} from './bounded-fetch.ts';

Deno.test('boundedFetch honors Retry-After before retrying', async () => {
  const waits: number[] = [];
  const responses = [new Response('busy', {status: 429, headers: {'Retry-After': '2'}}), new Response('ok')];
  const result = await boundedFetch('https://example.test', {}, {
    fetchImpl: (() => Promise.resolve(responses.shift()!)) as typeof fetch,
    sleep: milliseconds => { waits.push(milliseconds); return Promise.resolve(); }, now: () => 0
  });
  assert.equal(await result.text(), 'ok');
  assert.deepEqual(waits, [2000]);
});

Deno.test('boundedFetch never retries an unsafe request unless explicitly allowed', async () => {
  let calls = 0;
  const result = await boundedFetch('https://example.test', {method: 'POST'}, {
    fetchImpl: (() => { calls++; return Promise.resolve(new Response('busy', {status: 503})); }) as typeof fetch
  });
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
});

Deno.test('boundedFetch classifies an expired deadline', async () => {
  await assert.rejects(() => boundedFetch('https://example.test', {}, {
    timeoutMs: 5, maxAttempts: 1,
    fetchImpl: ((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch
  }), (error: unknown) => error instanceof BoundedFetchError && error.kind === 'timeout');
});
