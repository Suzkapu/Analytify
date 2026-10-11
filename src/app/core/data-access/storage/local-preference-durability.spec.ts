import {afterEach, describe, expect, it, vi} from 'vitest';
import {StorageService} from './storage.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

const key = 'design-v2:mobile-shortcuts:test-spotify-user';
function boundary() {
  const disk = new Map<string, string>();
  const transactions: Array<any> = [];
  const openingErrors: Error[] = [];
  const putErrors: Error[] = [];
  const cloud = {saveUserCache: vi.fn(), loadUserCache: vi.fn()};
  const lifecycle = new SessionLifecycleService();
  const database = {transaction: () => {
    const changes: Array<() => void> = [];
    const tx: any = {error: null, objectStore: (name: string) => ({
      put: (entry: {key: string; value: string}) => {
        const failure = putErrors.shift();
        if (failure) throw failure;
        const request: any = {};
        changes.push(() => disk.set(`${name}:${entry.key}`, entry.value));
        tx.request = request;
        return request;
      },
      delete: (entryKey: string) => {changes.push(() => disk.delete(`${name}:${entryKey}`)); return {};}
    }),
    complete: () => {changes.forEach(apply => apply()); tx.oncomplete?.();},
    abort: () => {tx.onabort?.();}
    };
    transactions.push(tx);
    return tx;
  }};
  vi.stubGlobal('indexedDB', {open: () => {
    const request: any = {};
    queueMicrotask(() => {
      const error = openingErrors.shift();
      if (error) request.onerror?.({target: {error}});
      else request.onsuccess?.({target: {result: database}});
    });
    return request;
  }});
  const service = new StorageService(cloud as never, lifecycle);
  return {service, disk, transactions, openingErrors, putErrors, cloud, lifecycle};
}
afterEach(() => vi.unstubAllGlobals());
describe('Durable local device preference', () => {
  it('acknowledges a chosen zero only after transaction commit, without cloud effects', async () => {
    const {service, transactions, disk, cloud} = boundary();
    const saved = service.setLocalItemDurably(key, '[]');
    let acknowledged = false;
    void saved.then(() => {acknowledged = true;});
    await vi.waitFor(() => expect(transactions).toHaveLength(1));
    transactions[0].request.onsuccess?.();
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    expect(service.getItem(key)).toBeNull();
    expect(disk.has(`featureData:${key}`)).toBe(false);
    transactions[0].complete();
    await saved;
    expect(acknowledged).toBe(true);
    expect(service.getItem(key)).toBe('[]');
    expect(disk.get(`featureData:${key}`)).toBe('[]');
    expect(cloud.saveUserCache).not.toHaveBeenCalled();
    expect(cloud.loadUserCache).not.toHaveBeenCalled();
  });

  it('retains the last committed value on abort and allows a successful retry', async () => {
    const {service, transactions, disk} = boundary();
    const first = service.setLocalItemDurably(key, '["stats"]');
    await vi.waitFor(() => expect(transactions).toHaveLength(1));
    transactions[0].complete(); await first;
    const failed = service.setLocalItemDurably(key, '[]');
    const rejection = expect(failed).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(transactions).toHaveLength(2));
    transactions[1].abort(); await rejection;
    expect(service.getItem(key)).toBe('["stats"]');
    expect(disk.get(`featureData:${key}`)).toBe('["stats"]');
    const retry = service.setLocalItemDurably(key, '[]');
    await vi.waitFor(() => expect(transactions).toHaveLength(3));
    transactions[2].complete(); await retry;
    expect(service.getItem(key)).toBe('[]');
    expect(disk.get(`featureData:${key}`)).toBe('[]');
  });

  it('reports quota aborts without changing the saved preference', async () => {
    const {service, transactions, disk} = boundary();
    const error = new DOMException('Isolated quota limit', 'QuotaExceededError');
    const saved = service.setLocalItemDurably(key, '[]');
    const rejected = expect(saved).rejects.toBe(error);
    await vi.waitFor(() => expect(transactions).toHaveLength(1));
    transactions[0].error = error;
    transactions[0].abort();
    await rejected;
    expect(service.getItem(key)).toBeNull();
    expect(disk.has(`featureData:${key}`)).toBe(false);
  });

  it('rejects a synchronous store failure, aborts the transaction and permits retry', async () => {
    const {service, transactions, putErrors} = boundary();
    const error = new DOMException('Isolated readonly store', 'ReadOnlyError');
    putErrors.push(error);
    await expect(service.setLocalItemDurably(key, '[]')).rejects.toBe(error);
    expect(service.getItem(key)).toBeNull();
    const retry = service.setLocalItemDurably(key, '[]');
    await vi.waitFor(() => expect(transactions).toHaveLength(2));
    transactions[1].complete(); await retry;
    expect(service.getItem(key)).toBe('[]');
  });

  it('exposes a database-open failure and retries without poisoning future saves', async () => {
    const {service, openingErrors, transactions} = boundary();
    const error = new Error('Isolated database unavailable');
    openingErrors.push(error);
    await expect(service.setLocalItemDurably(key, '[]')).rejects.toBe(error);
    expect(service.getItem(key)).toBeNull();
    expect(transactions).toHaveLength(0);
    const retry = service.setLocalItemDurably(key, '[]');
    await vi.waitFor(() => expect(transactions).toHaveLength(1));
    transactions[0].complete(); await retry;
    expect(service.getItem(key)).toBe('[]');
  });

  it('cancels an in-flight local write before logout drains and never publishes its value', async () => {
    const {service, transactions, disk, lifecycle} = boundary();
    const saved = service.setLocalItemDurably(key, '[]');
    const rejection = expect(saved).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(transactions).toHaveLength(1));
    await lifecycle.invalidateAndDrain(); await rejection;
    expect(service.getItem(key)).toBeNull();
    expect(disk.has(`featureData:${key}`)).toBe(false);
  });

  it('rejects a queued save if the session ends before the database becomes available', async () => {
    const {service, lifecycle, transactions} = boundary();
    const saved = service.setLocalItemDurably(key, '[]');
    const rejection = expect(saved).rejects.toMatchObject({name: 'AbortError'});
    await lifecycle.invalidateAndDrain(); await rejection;
    expect(transactions).toHaveLength(0);
    expect(service.getItem(key)).toBeNull();
  });
});
