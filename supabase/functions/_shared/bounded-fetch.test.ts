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

Deno.test('boundedFetch handles absent, invalid, negative and date Retry-After values within its elapsed budget', async () => {
  for (const [retryAfter, expected] of [[null, 500], ['invalid', 500], ['-1', 0], ['Thu, 01 Jan 1970 00:00:02 GMT', 2000], ['Thu, 01 Jan 1970 00:00:00 GMT', 0]] as const) {
    const waits: number[] = [];
    let calls = 0;
    const response = await boundedFetch('https://fixture.invalid', {}, {random: () => 0.5, now: () => 1000, sleep: ms => {waits.push(ms); return Promise.resolve();}, fetchImpl: (() => Promise.resolve(++calls === 1 ? new Response('', {status: 503, headers: retryAfter === null ? {} : {'retry-after': retryAfter}}) : new Response('recovered'))) as typeof fetch});
    assert.equal(await response.text(), 'recovered');
    assert.deepEqual(waits, [retryAfter === 'Thu, 01 Jan 1970 00:00:02 GMT' ? 1000 : expected]);
  }
});
Deno.test('boundedFetch cancellation propagates before transport and while the transport is pending', async () => {
  const alreadyCancelled = new AbortController(); alreadyCancelled.abort('fixture');
  await assert.rejects(() => boundedFetch('https://fixture.invalid', {signal: alreadyCancelled.signal}), (e: unknown) => e instanceof BoundedFetchError && e.kind === 'cancelled');
  const inFlight = new AbortController();
  await assert.rejects(() => boundedFetch('https://fixture.invalid', {signal: inFlight.signal}, {fetchImpl: ((_url, init) => new Promise((_resolve, reject) => {init?.signal?.addEventListener('abort', () => reject(new Error('fixture abort'))); inFlight.abort('fixture');})) as typeof fetch}), (e: unknown) => e instanceof BoundedFetchError && e.kind === 'cancelled');
});
Deno.test('boundedFetch recovers network failures, exhausts retry budgets and preserves typed errors', async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await boundedFetch('https://fixture.invalid', {method: 'PATCH'}, {retryUnsafe: true, random: () => 0.5, sleep: ms => {waits.push(ms); return Promise.resolve();}, fetchImpl: (() => {if (++calls === 1) return Promise.reject(new Error('fixture disconnect')); return Promise.resolve(new Response('recovered'));}) as typeof fetch});
  assert.equal(await result.text(), 'recovered');
  assert.deepEqual(waits, [500]);
  for (const responseFailure of [true, false]) await assert.rejects(() => boundedFetch('https://fixture.invalid', {}, {elapsedBudgetMs: 1, now: () => 0, fetchImpl: (() => responseFailure ? Promise.resolve(new Response('', {status: 503})) : Promise.reject(new Error('disconnect'))) as typeof fetch}), (e: unknown) => e instanceof BoundedFetchError && e.kind === 'retry_exhausted');
  const marker = new BoundedFetchError('fixture typed failure', 'transient');
  await assert.rejects(() => boundedFetch('https://fixture.invalid', {}, {fetchImpl: (() => Promise.reject(marker)) as typeof fetch}), error => error === marker);
  await assert.rejects(() => boundedFetch('https://fixture.invalid', {method: 'POST'}, {fetchImpl: (() => Promise.reject(new Error('fixture disconnect'))) as typeof fetch}), (e: unknown) => e instanceof BoundedFetchError && e.kind === 'transient');
});
Deno.test('boundedFetch supports its default sleep and zero-delay server-directed recovery', async () => {
  let calls = 0;
  const response = await boundedFetch('https://fixture.invalid', {}, {fetchImpl: (() => Promise.resolve(++calls === 1 ? new Response('', {status: 503, headers: {'retry-after': '0'}}) : new Response('recovered'))) as typeof fetch});
  assert.equal(await response.text(), 'recovered');
});
