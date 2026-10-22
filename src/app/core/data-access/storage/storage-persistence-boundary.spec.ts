import {afterEach, describe, expect, it, vi} from 'vitest';
import {StorageService} from './storage.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {environment} from '@env/environment';

// This is a deterministic IDB platform boundary, not native-browser evidence.
// It stores actual rows and exposes request/transaction errors to the real service.
function boundary({upgradeFrom, legacy = false}: {upgradeFrom?: number; legacy?: boolean} = {}) {
  const data = new Map<string, Map<any, any>>([
    ['appData', new Map()], ['statsHistory', new Map()], ['featureData', new Map()]
  ]);
  const indexes = new Set(legacy ? [] : ['by_user_range']);
  const failures = new Map<string, unknown[]>();
  const requests: string[] = [];
  const transactions: any[] = [];
  let transactionError: unknown;
  let openError: unknown;
  let nextId = 1;
  const takeFailure = (key: string) => failures.get(key)?.shift();
  const database: any = {
    objectStoreNames: {contains: (name: string) => data.has(name)},
    createObjectStore(name: string) {data.set(name, new Map()); return store(name);},
    transaction(names: string | string[], mode: string) {
      if (transactionError) {const error = transactionError; transactionError = undefined; throw error;}
      const tx: any = {names, mode, pending: 0, aborted: false, error: null,
        objectStore: (name: string) => store(name, tx),
        abort() {tx.aborted = true; queueMicrotask(() => tx.onabort?.({target: tx}));}
      };
      transactions.push(tx);
      return tx;
    }
  };
  function request(name: string, operation: string, action: () => unknown, tx?: any) {
    requests.push(`${name}.${operation}`);
    const req: any = {};
    if (tx) tx.pending++;
    queueMicrotask(() => {
      const error = takeFailure(`${name}.${operation}`);
      if (error) {
        req.error = error;
        if (tx) tx.error = error;
        req.onerror?.({target: req});
        tx?.onerror?.({target: req});
        tx?.onabort?.({target: tx});
      } else {
        req.result = action();
        req.onsuccess?.({target: req});
      }
      if (tx && --tx.pending === 0) queueMicrotask(() => {if (!tx.aborted) tx.oncomplete?.();});
    });
    return req;
  }
  function store(name: string, tx?: any): any {
    const rows = data.get(name)!;
    return {
      indexNames: {contains: (index: string) => indexes.has(index)},
      createIndex(index: string) {indexes.add(index);},
      index: () => ({getAll: ({only: [owner, range]}: any) => request(name, 'getAll', () => [...rows.values()].filter(row => row.userId === owner && row.range === range), tx)}),
      get: (key: string) => request(name, 'get', () => rows.get(key), tx),
      getAll: () => request(name, 'getAll', () => [...rows.values()], tx),
      put: (row: any) => request(name, 'put', () => {const id = row.key ?? row.id ?? nextId++; rows.set(id, {...row, ...(name === 'statsHistory' ? {id} : {})}); return id;}, tx),
      add: (row: any) => request(name, 'add', () => {const id = nextId++; rows.set(id, {...row, id}); return id;}, tx),
      delete: (id: any) => request(name, 'delete', () => rows.delete(id), tx),
      clear: () => request(name, 'clear', () => rows.clear(), tx),
      openCursor() {
        const entries = [...rows.entries()];
        let offset = 0;
        const req: any = {};
        const next = () => queueMicrotask(() => {
          const error = takeFailure(`${name}.openCursor`);
          if (error) {req.onerror?.({target: {error}}); return;}
          const entry = entries[offset++];
          const cursor = entry ? {value: entry[1], delete: () => rows.delete(entry[0]), continue: next} : null;
          req.onsuccess?.({target: {result: cursor}});
        });
        next();
        return req;
      }
    };
  }
  vi.stubGlobal('indexedDB', {open: vi.fn(() => {
    const req: any = {};
    queueMicrotask(() => {
      if (openError) {const error = openError; openError = undefined; req.onerror?.({target: {error}}); return;}
      if (upgradeFrom !== undefined) {
        req.onupgradeneeded?.({oldVersion: upgradeFrom, target: {result: database, transaction: {objectStore: (name: string) => store(name)}}});
        upgradeFrom = undefined;
      }
      queueMicrotask(() => req.onsuccess?.({target: {result: database}}));
    });
    return req;
  })});
  vi.stubGlobal('IDBKeyRange', {only: (value: unknown) => ({only: value})});
  const cloud = {loadUserCache: vi.fn().mockResolvedValue([]), saveUserCache: vi.fn().mockResolvedValue(undefined)};
  const lifecycle = new SessionLifecycleService();
  const service = new StorageService(cloud as never, lifecycle);
  return {service, cloud, lifecycle, data, indexes, database, requests, transactions, failures,
    failOpen(error: unknown) {openError = error;}, failTransaction(error: unknown) {transactionError = error;},
    seed(storeName: string, key: any, row: any) {data.get(storeName)!.set(key, row);},
    async settle() {await lifecycle.drainCurrent(); await new Promise(resolve => setTimeout(resolve, 0));}
  };
}
afterEach(() => {environment.production = true; vi.unstubAllGlobals(); vi.restoreAllMocks();});

describe('Storage persistence and service boundaries', () => {
  it('writes metadata and feature rows separately, reopens only metadata and lazily restores requested payloads', async () => {
    const h = boundary();
    h.service.setItem('spotifyAccessToken', 'isolated-token', false);
    h.service.setItem('fixture_playlist', '["song"]', false);
    await h.settle();
    expect(h.data.get('appData')!.get('spotifyAccessToken')?.value).toBe('isolated-token');
    expect(h.data.get('featureData')!.get('fixture_playlist')?.value).toBe('["song"]');
    const reopened = new StorageService(h.cloud as never, h.lifecycle);
    await reopened.initFromDB();
    expect(reopened.getItem('spotifyAccessToken')).toBe('isolated-token');
    expect(reopened.getItem('fixture_playlist')).toBeNull();
    expect(await reopened.hydrateItems(['fixture_playlist'], {readFailure: 'reject'})).toBe(1);
    expect(reopened.getItem('fixture_playlist')).toBe('["song"]');
    h.service.removeItem('fixture_playlist');
    await h.settle();
    expect(h.data.get('featureData')!.has('fixture_playlist')).toBe(false);
  });

  it('upgrades legacy feature payloads out of startup metadata and restores legal acceptance to metadata', async () => {
    const h = boundary({upgradeFrom: 3, legacy: true});
    h.seed('appData', 'owner_playlist', {key: 'owner_playlist', value: 'feature'});
    h.seed('appData', 'spotifyUserId', {key: 'spotifyUserId', value: 'owner'});
    h.seed('featureData', 'termsAcceptance', {key: 'termsAcceptance', value: 'accepted'});
    await h.service.initFromDB();
    expect(h.indexes.has('by_user_range')).toBe(true);
    expect(h.service.getItem('termsAcceptance')).toBe('accepted');
    expect(h.service.getItem('owner_playlist')).toBeNull();
    expect(h.data.get('featureData')!.has('termsAcceptance')).toBe(false);
    expect(h.data.get('appData')!.has('owner_playlist')).toBe(false);
    expect(await h.service.hydrateItems(['owner_playlist'])).toBe(1);
  });

  it('creates missing stores and index on a new database without requiring a legacy legal record', async () => {
    const h = boundary({upgradeFrom: 0, legacy: true});
    h.data.clear();
    await h.service.initFromDB();
    expect([...h.data.keys()].sort()).toEqual(['appData', 'featureData', 'statsHistory']);
    expect(h.service.getCacheKeys()).toEqual([]);
  });

  it('leaves version-four legal metadata untouched during an upgrade event', async () => {
    const h = boundary({upgradeFrom: 4});
    await h.service.initFromDB();
    expect(h.requests).not.toContain('featureData.get');
  });

  it('deduplicates bootstrap work and degrades on metadata read or transaction failures', async () => {
    for (const failure of ['request', 'transaction']) {
      const h = boundary();
      if (failure === 'request') h.failures.set('appData.getAll', [new Error('isolated read failure')]);
      else h.failTransaction(new Error('isolated transaction failure'));
      const first = h.service.initFromDB();
      expect(h.service.initFromDB()).toBe(first);
      await expect(first).resolves.toBeUndefined();
      expect(h.service.getCacheKeys()).toEqual([]);
    }
  });

  it('works synchronously without IndexedDB and can retry a later database open for lazy reads', async () => {
    const h = boundary();
    const factory = indexedDB;
    vi.stubGlobal('indexedDB', undefined);
    await h.service.initFromDB();
    h.service.setItem('local', 'memory-only', false);
    await h.lifecycle.drainCurrent();
    expect(h.service.getItem('local')).toBe('memory-only');
    expect(await h.service.hydrateItems(['missing'])).toBe(0);
    vi.stubGlobal('indexedDB', factory);
    h.seed('featureData', 'later', {key: 'later', value: 'recovered'});
    expect(await h.service.hydrateItems(['later'])).toBe(1);
    expect(h.service.getItem('later')).toBe('recovered');
  });

  it('loads all feature payloads only on explicit request and handles read/open/transaction failures', async () => {
    const h = boundary();
    h.seed('featureData', 'one', {key: 'one', value: '1'});
    h.seed('featureData', 'two', {key: 'two', value: '2'});
    expect(await h.service.hydrateAllFeatureData()).toBe(2);
    expect(h.service.getItem('two')).toBe('2');
    h.failures.set('featureData.getAll', [new Error('bulk read failed')]);
    expect(await h.service.hydrateAllFeatureData()).toBe(0);
    h.failTransaction(new Error('transaction unavailable'));
    expect(await h.service.hydrateAllFeatureData()).toBe(0);
    const unavailable = boundary(); unavailable.failOpen(new Error('open unavailable'));
    expect(await unavailable.service.hydrateAllFeatureData()).toBe(0);
  });

  it('saves Stats history, filters by owner/range, sorts chronologically and deletes only requested identities', async () => {
    const h = boundary();
    await h.service.saveStatsHistory({id: 100, userId: 'owner', range: 'short', timestamp: 20});
    await h.service.saveStatsHistory({id: 101, userId: 'owner', range: 'short', timestamp: 10});
    await h.service.saveStatsHistory({id: 102, userId: 'other', range: 'short', timestamp: 1});
    expect((await h.service.getStatsHistory('owner', 'short')).map(row => row.id)).toEqual([101, 100]);
    await h.service.deleteStatsHistoryEntries([100, 100]);
    expect([...h.data.get('statsHistory')!.keys()].sort()).toEqual([101, 102]);
    await h.service.clearStatsHistory('owner');
    expect([...h.data.get('statsHistory')!.keys()]).toEqual([102]);
    await h.service.clearAllHistory();
    expect(h.data.get('statsHistory')!.size).toBe(0);
    const previous = h.transactions.length;
    await h.service.deleteStatsHistoryEntries([]);
    expect(h.transactions).toHaveLength(previous);
  });

  it('surfaces a failed Stats write and permits a successful retry without inventing a row', async () => {
    const h = boundary(); const error = new Error('isolated quota');
    h.failures.set('statsHistory.put', [error]);
    await expect(h.service.saveStatsHistory({id: 100})).rejects.toBe(error);
    expect(h.data.get('statsHistory')!.size).toBe(0);
    await h.service.saveStatsHistory({id: 100, userId: 'owner', range: 'short', timestamp: 10});
    expect(h.data.get('statsHistory')!.has(100)).toBe(true);
  });

  it('clear removes all stores and memory while failed deletions degrade without claiming external effects', async () => {
    const h = boundary();
    h.service.setItem('feature', 'value', false);
    await h.service.saveStatsHistory({id: 100, userId: 'owner'});
    await h.settle();
    await h.service.clear();
    expect(h.service.getCacheKeys()).toEqual([]);
    expect([...h.data.values()].every(rows => rows.size === 0)).toBe(true);
    h.failures.set('statsHistory.delete', [new Error('delete failed')]);
    await expect(h.service.deleteStatsHistoryEntries([100])).resolves.toBeUndefined();
    h.failures.set('statsHistory.openCursor', [new Error('cursor failed')]);
    await expect(h.service.clearStatsHistory('owner')).resolves.toBeUndefined();
    h.failures.set('statsHistory.clear', [new Error('clear failed')]);
    await expect(h.service.clearAllHistory()).resolves.toBeUndefined();
    h.failures.set('appData.clear', [new Error('metadata clear failed')]);
    await expect(h.service.clear()).resolves.toBeUndefined();
  });

  it('queues cloud writes per owner/key, recovers after a failure, and keeps independent keys moving', async () => {
    const h = boundary();
    h.service.setItem('spotifyUserId', 'owner', false);
    h.service.setItem('supabaseUserId', 'cloud-owner', false);
    h.service.setItem('cloud-owner_backup_active', 'true', false);
    let release!: () => void;
    h.cloud.saveUserCache.mockImplementationOnce(() => new Promise<void>(resolve => release = resolve));
    h.service.setItem('owner_playlist', 'old');
    await vi.waitFor(() => expect(h.cloud.saveUserCache).toHaveBeenCalledTimes(1));
    h.service.setItem('owner_playlist', 'new');
    h.service.setItem('owner_second', 'independent');
    await vi.waitFor(() => expect(h.cloud.saveUserCache).toHaveBeenCalledTimes(2));
    expect(h.cloud.saveUserCache.mock.calls[1]).toEqual(['cloud-owner', 'owner_second', 'independent']);
    release(); await h.settle();
    expect(h.cloud.saveUserCache.mock.calls[2]).toEqual(['cloud-owner', 'owner_playlist', 'new']);
    h.cloud.saveUserCache.mockRejectedValueOnce(new Error('isolated cloud unavailable'));
    h.service.setItem('owner_playlist', 'fails');
    await h.settle();
    h.service.setItem('owner_playlist', 'retry'); await h.settle();
    expect(h.cloud.saveUserCache).toHaveBeenLastCalledWith('cloud-owner', 'owner_playlist', 'retry');
    expect(h.service.getItem('owner_playlist')).toBe('retry');
  });

  it('drops queued cloud and local work after session replacement', async () => {
    const h = boundary();
    h.service.setItem('spotifyUserId', 'owner', false);
    h.service.setItem('supabaseUserId', 'cloud-owner', false);
    h.service.setItem('cloud-owner_backup_active', 'true', false);
    h.service.setItem('owner_playlist', 'old-session');
    h.service.removeItem('old-key');
    await h.lifecycle.invalidateAndDrain();
    expect(h.cloud.saveUserCache).not.toHaveBeenCalled();
    expect(h.data.get('featureData')!.has('owner_playlist')).toBe(false);
  });

  it('does not upload foreign keys, normalized data or controls and does not restore without an owner', async () => {
    const h = boundary();
    expect(await h.service.restoreItemsFromCloud(['payload'])).toBe(0);
    expect(await h.service.restoreItemsFromCloud([''])).toBe(0);
    expect(h.service.shouldSyncUserCacheKey('owner_playlist')).toBe(false);
    h.service.setItem('spotifyUserId', 'owner', false);
    h.service.setItem('supabaseUserId', 'cloud-owner', false);
    h.service.setItem('cloud-owner_backup_active', 'true', false);
    for (const key of ['foreign_playlist', 'owner_stats_short', 'owner_recently_played', 'owner_profile_pic', 'cloud-owner_last_synced_at', 'cloud-owner_backup_active']) h.service.setItem(key, 'not-uploaded');
    await h.settle();
    expect(h.cloud.saveUserCache).not.toHaveBeenCalled();
    expect(h.cloud.loadUserCache).not.toHaveBeenCalled();
    h.service.setItem('cloud-owner_backup_active', 'true', false);
    h.cloud.loadUserCache.mockResolvedValue([]);
    const beforeApply = vi.fn();
    expect(await h.service.restoreItemsFromCloud(['owner_playlist'], () => true, beforeApply)).toBe(0);
    expect(beforeApply).not.toHaveBeenCalled();
  });
});

describe('Development cache migration boundaries', () => {
  it('copies missing device metadata and history to development identities without duplicating existing records', async () => {
    environment.production = false;
    const h = boundary();
    const cloudId = '12345678-1234-1234-1234-123456789012';
    const devCloudId = 'de11' + cloudId.substring(4);
    for (const [key, value] of [['spotifyUserId', 'owner'], ['supabaseUserId', cloudId], ['owner_sortOrder', 'date'], ['owner_showSaved', 'true'], ['owner_dev_showSaved', 'false'], [`${cloudId}_backup_active`, 'true']]) h.seed('appData', key, {key, value});
    h.seed('statsHistory', 100, {id: 100, userId: 'owner', range: 'short', timestamp: 10});
    h.seed('statsHistory', 101, {id: 101, userId: 'owner', range: 'short', timestamp: 20});
    h.seed('statsHistory', 102, {id: 102, userId: 'owner_dev', range: 'short', timestamp: 10});
    h.seed('statsHistory', 103, {id: 103, userId: 'other', range: 'short', timestamp: 1});
    await h.service.initFromDB();
    expect(h.service.getItem('owner_dev_sortOrder')).toBe('date');
    expect(h.service.getItem('owner_dev_showSaved')).toBe('false');
    expect(h.service.getItem(`${devCloudId}_backup_active`)).toBe('true');
    expect((await h.service.getStatsHistory('owner_dev', 'short')).map(row => row.timestamp)).toEqual([10, 20]);
    expect((await h.service.getStatsHistory('owner', 'short')).map(row => row.id)).toEqual([100, 101]);
    h.service.setItem('owner_playlist', 'device-copy');
    await h.settle();
    expect(h.cloud.saveUserCache).toHaveBeenCalledWith(devCloudId, 'owner_playlist', 'device-copy');
    expect(h.data.get('appData')!.get('owner_dev_sortOrder')?.value).toBe('date');
  });

  it('recognizes an already-development Spotify identity and ignores short or missing cloud identities', async () => {
    environment.production = false;
    const h = boundary();
    h.seed('appData', 'spotifyUserId', {key: 'spotifyUserId', value: 'owner_dev'});
    h.seed('appData', 'owner_sortOrder', {key: 'owner_sortOrder', value: 'name'});
    h.seed('appData', 'supabaseUserId', {key: 'supabaseUserId', value: 'short'});
    await h.service.initFromDB();
    expect(h.service.getItem('owner_dev_sortOrder')).toBe('name');
    expect(h.service.getCacheKeys().some(key => key.startsWith('de11'))).toBe(false);
    const empty = boundary(); await empty.service.initFromDB();
    expect(empty.service.getCacheKeys()).toEqual([]);
    expect(empty.requests).not.toContain('statsHistory.getAll');
  });

  it('continues bootstrap after development history migration fails', async () => {
    environment.production = false;
    const h = boundary();
    h.seed('appData', 'spotifyUserId', {key: 'spotifyUserId', value: 'owner'});
    h.failures.set('statsHistory.getAll', [new Error('isolated migration failure')]);
    await expect(h.service.initFromDB()).resolves.toBeUndefined();
    expect(h.service.getItem('spotifyUserId')).toBe('owner');
  });

  it('preserves startup identity if development metadata persistence is temporarily unavailable', async () => {
    environment.production = false;
    const h = boundary();
    h.seed('appData', 'spotifyUserId', {key: 'spotifyUserId', value: 'owner'});
    h.seed('appData', 'owner_sortOrder', {key: 'owner_sortOrder', value: 'name'});
    const transaction = h.database.transaction.bind(h.database);
    vi.spyOn(h.database, 'transaction').mockImplementation((...args: unknown[]) => {
      if (args[0] === 'appData' && args[1] === 'readwrite') throw new Error('isolated metadata transaction unavailable');
      return transaction(...args);
    });
    await expect(h.service.initFromDB()).resolves.toBeUndefined();
    expect(h.service.getItem('spotifyUserId')).toBe('owner');
    expect(h.data.get('appData')!.has('owner_dev_sortOrder')).toBe(false);
  });
});

describe('Storage write and session failure boundaries', () => {
  it('logs fire-and-forget write/remove failures without losing the synchronous memory contract', async () => {
    const h = boundary();
    h.failures.set('featureData.put', [new Error('isolated write failure')]);
    h.service.setItem('key', 'visible', false); await h.settle();
    expect(h.service.getItem('key')).toBe('visible');
    expect(h.data.get('featureData')!.has('key')).toBe(false);
    h.failures.set('appData.delete', [new Error('isolated delete failure')]);
    h.service.removeItem('key'); await h.settle();
    expect(h.service.getItem('key')).toBeNull();
    h.failTransaction(new Error('isolated transaction failure'));
    h.service.setItem('retryable', 'latest', false); await h.settle();
    expect(h.service.getItem('retryable')).toBe('latest');
    h.failTransaction(new Error('isolated delete transaction failure'));
    h.service.removeItem('retryable'); await h.settle();
    expect(h.service.getItem('retryable')).toBeNull();
  });

  it('ignores an obsolete Stats save before its database open finishes', async () => {
    const h = boundary();
    const save = h.service.saveStatsHistory({id: 100, userId: 'old-owner'});
    await h.lifecycle.invalidateAndDrain(); await save;
    expect(h.data.get('statsHistory')!.has(100)).toBe(false);
  });

  it('keeps bulk hydration empty on a successful absent feature dataset and tolerates missing legacy reads', async () => {
    const h = boundary();
    expect(await h.service.hydrateAllFeatureData()).toBe(0);
    h.failTransaction(new Error('isolated feature read unavailable'));
    expect(await h.service.hydrateItems(['absent'])).toBe(0);
    h.failTransaction(new Error('isolated strict read unavailable'));
    await expect(h.service.hydrateItems(['absent'], {readFailure: 'reject'})).rejects.toThrow('isolated strict read unavailable');
  });
});

 describe('Additional local persistence recovery', () => {
  it('retains an existing development cloud preference instead of overwriting it from a real identity', async () => {
    environment.production = false;
    const h = boundary(); const owner = '12345678-1234-1234-1234-123456789012'; const devOwner = 'de11' + owner.substring(4);
    for (const [key, value] of [['supabaseUserId', owner], [`${owner}_backup_active`, 'true'], [`${devOwner}_backup_active`, 'false']]) h.seed('appData', key, {key, value});
    await h.service.initFromDB();
    expect(h.service.getItem(`${devOwner}_backup_active`)).toBe('false');
  });
  it('degrades an identity migration open failure and retains local-only writes without account context', async () => {
    const h = boundary(); h.failOpen(new Error('isolated opening failure'));
    h.service.setItem('spotifyUserId', 'owner', false); await h.settle();
    expect(h.service.getItem('spotifyUserId')).toBe('owner');
    h.service.setItem('anonymous', 'local-only'); await h.settle();
    expect(h.cloud.saveUserCache).not.toHaveBeenCalled();
  });
});
