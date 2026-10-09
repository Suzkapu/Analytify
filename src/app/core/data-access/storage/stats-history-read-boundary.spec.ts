import {afterEach, describe, expect, it, vi} from 'vitest';
import {StorageService} from './storage.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

function requestBoundary(indexed = false) {
  const responses: Array<{data?: any[]; error?: Error}> = [];
  const request = () => {
    const result: any = {};
    queueMicrotask(() => {
      const response = responses.shift() || {data: []};
      if (response.error) result.onerror({target: {error: response.error}});
      else result.onsuccess({target: {result: response.data}});
    });
    return result;
  };
  const getAll = vi.fn(request);
  const store = {indexNames: {contains: () => indexed}, getAll, index: vi.fn(() => ({getAll}))};
  const db = {transaction: vi.fn(() => ({objectStore: vi.fn(() => store)}))};
  const opens: Array<Error | null> = [];
  const open = vi.fn(() => {
    const result: any = {};
    queueMicrotask(() => {
      const error = opens.shift();
      if (error) result.onerror({target: {error}});
      else result.onsuccess({target: {result: db}});
    });
    return result;
  });
  vi.stubGlobal('indexedDB', {open});
  vi.stubGlobal('IDBKeyRange', {only: (value: unknown) => ({only: value})});
  const service = new StorageService({} as never, new SessionLifecycleService());
  return {service, responses, opens, open, db, store, getAll};
}
const strictRead = (service: StorageService) =>
  service.getStatsHistory('reader-A', 'short_term', {readFailure: 'reject'});

afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});
describe('Saved Stats history read and retry boundary', () => {
  it('distinguishes an empty successful inventory from a failed strict read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {service, responses} = requestBoundary();
    expect(await strictRead(service)).toEqual([]);
    const error = new Error('Isolated cache request failure');
    responses.push({error});
    await expect(strictRead(service)).rejects.toBe(error);
  });

  it('recovers after a failed cache request and retains owner/range filtering and date order', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {service, responses, open, db} = requestBoundary();
    responses.push({error: new Error('Isolated cache request failure')});
    await expect(strictRead(service)).rejects.toThrow('Isolated cache request failure');
    responses.push({data: [
      {id: 2, userId: 'reader-A', range: 'short_term', timestamp: 200},
      {id: 3, userId: 'reader-B', range: 'short_term', timestamp: 50},
      {id: 4, userId: 'reader-A', range: 'long_term', timestamp: 30},
      {id: 1, userId: 'reader-A', range: 'short_term', timestamp: 100}
    ]});
    expect((await strictRead(service)).map(row => row.id)).toEqual([1, 2]);
    expect(open).toHaveBeenCalledOnce();
    expect(db.transaction.mock.calls).toEqual([['statsHistory', 'readonly'], ['statsHistory', 'readonly']]);
  });

  it('can retry opening the database after an initial temporary failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {service, opens, open} = requestBoundary();
    opens.push(new Error('Isolated database open failure'));
    await expect(strictRead(service)).rejects.toThrow('Isolated database open failure');
    expect(await strictRead(service)).toEqual([]);
    expect(open.mock.calls).toEqual([['AnalytifyDB', 4], ['AnalytifyDB', 4]]);
  });

  it('preserves the existing explicitly tolerant read behavior for other callers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {service, responses} = requestBoundary();
    responses.push({error: new Error('Isolated optional cache failure')});
    expect(await service.getStatsHistory('reader-A', 'short_term')).toEqual([]);
  });

  it('uses the owner/range index when available without enumerating unrelated rows', async () => {
    const {service, store, getAll} = requestBoundary(true);
    expect(await strictRead(service)).toEqual([]);
    expect(store.index).toHaveBeenCalledExactlyOnceWith('by_user_range');
    expect(getAll).toHaveBeenCalledExactlyOnceWith({only: ['reader-A', 'short_term']});
  });
});
