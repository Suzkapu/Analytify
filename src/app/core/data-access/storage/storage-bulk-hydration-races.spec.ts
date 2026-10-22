import {afterEach, describe, expect, it, vi} from 'vitest';
import {StorageService} from './storage.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

function pendingBulkRead() {
  const lifecycle = new SessionLifecycleService();
  let readCount = 0;
  let finishRead!: (entries: Array<{key: string; value: string}>) => void;
  const database = {transaction: () => {
    const transaction: any = {objectStore: () => ({
      getAll: () => {
        readCount++;
        const request: any = {};
        finishRead = entries => {request.result = entries; request.onsuccess?.();};
        return request;
      },
      put: () => ({}), delete: () => ({}),
      clear: () => {const request: any = {}; queueMicrotask(() => request.onsuccess?.()); return request;}
    })};
    queueMicrotask(() => transaction.oncomplete?.());
    return transaction;
  }};
  vi.stubGlobal('indexedDB', {open: () => {
    const request: any = {};
    queueMicrotask(() => request.onsuccess?.({target: {result: database}}));
    return request;
  }});
  const service = new StorageService({} as never, lifecycle);
  return {service, lifecycle, reads: () => readCount, ready: () => typeof finishRead === 'function', finish: (entries: Array<{key: string; value: string}>) => finishRead(entries)};
}
afterEach(() => vi.unstubAllGlobals());
describe('Explicit backup bulk hydration ownership', () => {
  it('does not republish an old account payload after session replacement', async () => {
    const h = pendingBulkRead();
    const read = h.service.hydrateAllFeatureData();
    await vi.waitFor(() => expect(h.ready()).toBe(true));
    await h.lifecycle.invalidateAndDrain();
    h.finish([{key: 'old-owner_playlist', value: 'private old-account fixture'}]);
    expect(await read).toBe(0);
    expect(h.service.getItem('old-owner_playlist')).toBeNull();
  });

  it('does not resurrect cleared datasets when a bulk disk response arrives late', async () => {
    const h = pendingBulkRead();
    const read = h.service.hydrateAllFeatureData();
    await vi.waitFor(() => expect(h.ready()).toBe(true));
    await h.service.clear();
    h.finish([{key: 'owner_playlist', value: 'cleared fixture'}]);
    expect(await read).toBe(0);
    expect(h.service.getItem('owner_playlist')).toBeNull();
  });

  it('keeps a newer route value and a removed key when bulk disk hydration arrives late', async () => {
    const h = pendingBulkRead();
    const read = h.service.hydrateAllFeatureData();
    await vi.waitFor(() => expect(h.ready()).toBe(true));
    h.service.setItem('owner_playlist', 'newer route value', false);
    h.service.removeItem('owner_removed');
    h.finish([{key: 'owner_playlist', value: 'old disk value'}, {key: 'owner_removed', value: 'deleted disk value'}]);
    expect(await read).toBe(0);
    expect(h.service.getItem('owner_playlist')).toBe('newer route value');
    expect(h.service.getItem('owner_removed')).toBeNull();
    await h.lifecycle.drainCurrent();
  });
});

it('retries a discarded old-session bulk read and merges only currently missing untouched keys', async () => {
  const h = pendingBulkRead();
  const stale = h.service.hydrateAllFeatureData();
  await vi.waitFor(() => expect(h.ready()).toBe(true));
  await h.lifecycle.invalidateAndDrain();
  h.finish([{key: 'old-owner_playlist', value: 'old'}]);
  expect(await stale).toBe(0);
  h.service.setItem('new-owner_current', 'fresh memory value', false);
  const retry = h.service.hydrateAllFeatureData();
  await vi.waitFor(() => expect(h.reads()).toBe(2));
  h.finish([{key: 'new-owner_current', value: 'older disk value'}, {key: 'new-owner_missing', value: 'restored'}]);
  expect(await retry).toBe(1);
  expect(h.service.getItem('new-owner_current')).toBe('fresh memory value');
  expect(h.service.getItem('new-owner_missing')).toBe('restored');
  expect(h.service.getItem('old-owner_playlist')).toBeNull();
  await h.lifecycle.drainCurrent();
});

it('does not start bulk reads after a session replacement or clear during database opening', async () => {
  for (const action of ['replace-session', 'clear']) {
    const h = pendingBulkRead();
    const read = h.service.hydrateAllFeatureData();
    if (action === 'replace-session') await h.lifecycle.invalidateAndDrain();
    else await h.service.clear();
    expect(await read).toBe(0);
    expect(h.ready()).toBe(false);
  }
});
