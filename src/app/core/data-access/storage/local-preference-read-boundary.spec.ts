import {afterEach, describe, expect, it, vi} from 'vitest';
import {StorageService} from './storage.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

const key = 'design-v2:mobile-shortcuts:synthetic-owner';
const strict = {readFailure: 'reject'} as const;
function boundary() {
  const requests: Array<any> = [];
  const openErrors: Error[] = [];
  const lifecycle = new SessionLifecycleService();
  const db = {transaction: (store: string, mode: string) => {
    const tx: any = {error: null, abort: () => tx.onabort?.()};
    if (mode === 'readwrite') queueMicrotask(() => tx.oncomplete?.());
    tx.objectStore = () => ({
      clear: () => {
        const request: any = {};
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
      put: () => {queueMicrotask(() => tx.oncomplete?.()); return {};},
      delete: () => ({}),
      get: (requestedKey: string) => {
      const request: any = {};
      requests.push({store, key: requestedKey, request, tx,
        succeed: (value?: string) => {
          request.result = value === undefined ? undefined : {key: requestedKey, value};
          request.onsuccess?.();
          tx.oncomplete?.();
        },
        fail: (error: Error) => {
          request.error = error; tx.error = error;
          request.onerror?.({target: {error}});
          tx.onabort?.();
        }});
      return request;
    }});
    return tx;
  }};
  vi.stubGlobal('indexedDB', {open: () => {
    const request: any = {};
    queueMicrotask(() => {
      const error = openErrors.shift();
      if (error) request.onerror?.({target: {error}});
      else request.onsuccess?.({target: {result: db}});
    });
    return request;
  }});
  return {service: new StorageService({} as never, lifecycle), requests, openErrors, lifecycle};
}
afterEach(() => vi.unstubAllGlobals());
describe('Strict device preference hydration', () => {
  it('distinguishes an absent preference from a failed primary read and retries the read', async () => {
    const {service, requests} = boundary();
    const missing = service.hydrateItems([key], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].succeed();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].succeed();
    expect(await missing).toBe(0);
    expect(service.getItem(key)).toBeNull();

    const error = new Error('Isolated primary cache read failure');
    const failed = service.hydrateItems([key], strict);
    const rejection = expect(failed).rejects.toBe(error);
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].fail(error); await rejection;
    expect(requests).toHaveLength(3); // Failure must not masquerade as a legacy fallback.
    expect(service.getItem(key)).toBeNull();

    const retry = service.hydrateItems([key], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(4));
    requests[3].succeed('[]');
    expect(await retry).toBe(1);
    expect(service.getItem(key)).toBe('[]');
  });

  it('exposes open failure and successfully loads after retrying the database', async () => {
    const {service, openErrors, requests} = boundary();
    const error = new Error('Isolated database-open failure');
    openErrors.push(error);
    await expect(service.hydrateItems([key], strict)).rejects.toBe(error);
    expect(service.getItem(key)).toBeNull();
    const retry = service.hydrateItems([key], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].succeed('[]');
    expect(await retry).toBe(1);
  });

  it('exposes a failed legacy fallback instead of claiming a default preference', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key], strict);
    const error = new Error('Isolated legacy read failure');
    const rejection = expect(read).rejects.toBe(error);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].succeed();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].store).toBe('appData');
    requests[1].fail(error); await rejection;
    expect(service.getItem(key)).toBeNull();
  });

  it('does not publish a successful request if its read transaction subsequently aborts', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key], strict);
    const rejection = expect(read).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].request.result = {key, value: '[]'};
    requests[0].request.onsuccess?.();
    requests[0].tx.onabort?.();
    await rejection;
    expect(service.getItem(key)).toBeNull();
  });

  it('never publishes delayed local preferences after session replacement', async () => {
    const {service, requests, lifecycle} = boundary();
    const read = service.hydrateItems([key], strict);
    const rejection = expect(read).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await lifecycle.invalidateAndDrain();
    requests[0].succeed('[]'); await rejection;
    expect(service.getItem(key)).toBeNull();
  });

  it('retains a newer in-memory preference when strict hydration completes late', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    service.setItem(key, '[]', false);
    requests[0].succeed('["playlists","stats","history"]');
    expect(await read).toBe(0);
    expect(service.getItem(key)).toBe('[]');
  });

  it('loads a successful legacy value only after a successful absent primary read', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key, key, ''], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].succeed();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].succeed('[]');
    expect(await read).toBe(1);
    expect(service.getItem(key)).toBe('[]');
    expect(await service.hydrateItems([key], strict)).toBe(0);
    expect(requests).toHaveLength(2);
  });

  it('preserves the explicitly tolerant default when a local read fails', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key]);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].fail(new Error('Isolated optional primary failure'));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].succeed();
    expect(await read).toBe(0);
  });

  it('does not resurrect a preference removed while its disk read was pending', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    service.removeItem(key);
    requests[0].succeed('["stats"]');
    expect(await read).toBe(0);
    expect(service.getItem(key)).toBeNull();
  });

  it('does not repopulate cleared app data from an older pending read', async () => {
    const {service, requests} = boundary();
    const read = service.hydrateItems([key], strict);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await service.clear();
    requests[0].succeed('["stats"]');
    expect(await read).toBe(0);
    expect(service.getItem(key)).toBeNull();
  });

  it('keeps a strict multi-key read atomic when another requested entry fails', async () => {
    const {service, requests} = boundary();
    const second = key + ':second';
    const read = service.hydrateItems([key, second], strict);
    const error = new Error('Isolated second preference failure');
    const rejection = expect(read).rejects.toBe(error);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[0].succeed('[]'); requests[1].fail(error); await rejection;
    expect(service.getItem(key)).toBeNull();
    expect(service.getItem(second)).toBeNull();
  });
});

describe('Batched local hydration cancellation', () => {
  for (const readFailure of ['empty', 'reject'] as const) {
    it(`does not start a second batch after session replacement (${readFailure})`, async () => {
      const {service, requests, lifecycle} = boundary();
      const keys = Array.from({length: 5}, (_, index) => `${key}:${index}`);
      const read = service.hydrateItems(keys, {readFailure});
      const outcome = readFailure === 'reject' ? expect(read).rejects.toMatchObject({name: 'AbortError'}) : expect(read).resolves.toBe(0);
      await vi.waitFor(() => expect(requests).toHaveLength(4));
      await lifecycle.invalidateAndDrain();
      requests.forEach(request => request.succeed('isolated old value'));
      await outcome;
      expect(requests).toHaveLength(4);
      expect(service.getCacheKeys()).toEqual([]);
    });
  }
  it('discards a final tolerant read after session replacement', async () => {
    const {service, requests, lifecycle} = boundary();
    const read = service.hydrateItems([key]);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await lifecycle.invalidateAndDrain();
    requests[0].succeed('old');
    expect(await read).toBe(0);
    expect(service.getItem(key)).toBeNull();
  });
});
