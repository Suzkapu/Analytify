import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const local = {id: 'local-A', timestamp: new Date(2026, 9, 3, 12).getTime(), snapshotDate: '2026-10-03',
  topTracks: [{id: 'cached', name: 'Cached ranking'}], topArtists: [], topGenres: [], isLoaded: true};
const cloud = {id: 'cloud-A', timestamp: new Date(2026, 9, 2, 12).getTime(), snapshotDate: '2026-10-02',
  topTracks: [], topArtists: [], topGenres: [], isLoaded: false};
function setup(cached = true) {
  const account = {backup: true, sharedOwner: ''};
  const cache: any[] = cached ? [{...local}] : [];
  const storage = {getStatsHistory: vi.fn(async () => [...cache]), deleteStatsHistoryEntries: vi.fn().mockResolvedValue(undefined),
    saveStatsHistory: vi.fn(async snapshot => {const index = cache.findIndex(row => row.id === snapshot.id);
      if (index < 0) cache.push(snapshot); else cache[index] = snapshot;})};
  const sdk = {loadAllStatsSnapshotsMetadata: vi.fn().mockResolvedValue(cached ? [local] : []),
    saveStatsSnapshot: vi.fn().mockResolvedValue(undefined), loadStatsSnapshotById: vi.fn().mockResolvedValue(null)};
  const render = {markForCheck: vi.fn()};
  const auth = {getUserId: () => 'metadata-reader-A', getSupabaseUserId: () => 'metadata-owner-A', isBackupActive: () => account.backup};
  const component = new UserStatsComponent(null as never, auth as never, storage as never, sdk as never,
    {snapshot: {paramMap: {get: () => account.sharedOwner}}} as never, undefined, render as never);
  return {component, account, storage, sdk, cache, render};
}
async function settle() {for (let i = 0; i < 25; i++) await Promise.resolve();}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 4, 12));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('Calendar metadata state and recovery at storage/cloud boundaries', () => {
  it('shows initial loading, then retains local dates while a cloud refresh is pending', async () => {
    const {component, storage, sdk, render} = setup(), read = deferred<any[]>(), request = deferred<any[]>();
    storage.getStatsHistory.mockReturnValueOnce(read.promise); sdk.loadAllStatsSnapshotsMetadata.mockReturnValue(request.promise);
    component.loadHistoryData();
    expect(component).toMatchObject({historyMetadataState: 'loading'});
    expect(sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    read.resolve([local]); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refreshing', historyData: [local]});
    expect(component.snapshotOptions.map(option => option.dateKey)).toEqual(['2026-10-03']);
    request.resolve([local]); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready', historyMetadataError: ''});
    expect(render.markForCheck).toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('reports successful empty inventory separately from unavailable metadata', async () => {
    const {component, sdk, storage} = setup(false);
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'empty', historyMetadataError: ''});
    expect(component.snapshotOptions).toEqual([]);
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('becomes ready only after new cloud dates are available locally', async () => {
    const {component, sdk, storage} = setup(false), write = deferred<void>();
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue([cloud]);
    storage.saveStatsHistory.mockImplementationOnce(async snapshot => {
      await write.promise; storage.getStatsHistory.mockResolvedValue([snapshot]);
    });
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'loading'});
    expect(component.snapshotOptions).toEqual([]);
    write.resolve(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready'});
    expect(component.snapshotOptions.map(option => option.dateKey)).toEqual(['2026-10-02']);
    component.ngOnDestroy();
  });

  it('recovers an initial cloud failure through loading and a genuinely empty result', async () => {
    const {component, sdk} = setup(false);
    sdk.loadAllStatsSnapshotsMetadata.mockRejectedValueOnce(new Error('Isolated metadata failure'));
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'unavailable', historyMetadataError: expect.any(String)});
    const retry = deferred<any[]>(); sdk.loadAllStatsSnapshotsMetadata.mockReturnValueOnce(retry.promise);
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'loading', historyMetadataError: ''});
    retry.resolve([]); await settle();
    expect(component).toMatchObject({historyMetadataState: 'empty', historyMetadataError: ''});
    component.ngOnDestroy();
  });

  it('preserves usable dates on refresh failure and throughout an explicit retry', async () => {
    const {component, sdk} = setup();
    sdk.loadAllStatsSnapshotsMetadata.mockRejectedValueOnce(new Error('Isolated refresh failure'));
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refresh-failed', historyData: [local]});
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    const retry = deferred<any[]>(); sdk.loadAllStatsSnapshotsMetadata.mockReturnValueOnce(retry.promise);
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refreshing', historyMetadataError: '', historyData: [local]});
    retry.resolve([local]); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready', historyMetadataError: ''});
    component.ngOnDestroy();
  });

  it.each([false, true])('does not reconcile an unread local inventory, cached=%s', async cached => {
    const {component, storage, sdk} = setup(cached);
    if (cached) {component.loadHistoryData(); await settle();}
    sdk.loadAllStatsSnapshotsMetadata.mockClear();
    storage.getStatsHistory.mockRejectedValueOnce(new Error('Isolated local read failure'));
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: cached ? 'refresh-failed' : 'unavailable'});
    expect(component.historyData).toEqual(cached ? [local] : []);
    expect(sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('stops reconciliation when the second local read fails after cloud inventory succeeds', async () => {
    const {component, storage, sdk} = setup();
    storage.getStatsHistory.mockResolvedValueOnce([local]).mockRejectedValueOnce(new Error('Isolated reconciliation read failure'));
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue([cloud]);
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refresh-failed', historyData: [local]});
    expect(storage.getStatsHistory.mock.calls).toEqual([
      ['metadata-reader-A', 'short_term', {readFailure: 'reject'}],
      ['metadata-reader-A', 'short_term', {readFailure: 'reject'}]
    ]);
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('does not let an older failure replace a newer successful refresh', async () => {
    const {component, sdk} = setup(), old = deferred<any[]>();
    sdk.loadAllStatsSnapshotsMetadata.mockReturnValueOnce(old.promise);
    component.loadHistoryData(); await settle();
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready'});
    old.reject(new Error('Isolated old failure')); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready', historyMetadataError: '', historyData: [local]});
    component.ngOnDestroy();
  });

  it('does not let older success hide a newer failure', async () => {
    const {component, sdk, storage} = setup(), old = deferred<any[]>();
    sdk.loadAllStatsSnapshotsMetadata.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('Isolated current failure'));
    component.loadHistoryData(); await settle(); component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refresh-failed'});
    old.resolve([cloud]); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refresh-failed', historyData: [local]});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('settles to cached readiness when backup is disabled during a pending refresh', async () => {
    const {component, sdk, storage, account} = setup(), request = deferred<any[]>();
    sdk.loadAllStatsSnapshotsMetadata.mockReturnValueOnce(request.promise);
    component.loadHistoryData(); await settle(); account.backup = false;
    request.resolve([cloud]); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready', historyData: [local], historyMetadataError: ''});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled(); expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each([false, true])('finishes local-only metadata without cloud requests, cached=%s', async cached => {
    const {component, sdk, account} = setup(cached); account.backup = false;
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: cached ? 'ready' : 'empty', historyMetadataError: ''});
    expect(sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('preserves partial cached dates after restore failure and recovers on retry', async () => {
    const {component, sdk, storage} = setup();
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue([local, cloud]);
    storage.saveStatsHistory.mockRejectedValueOnce(new Error('Isolated metadata persistence failure'));
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refresh-failed', historyData: [local]});
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready', historyMetadataError: ''});
    expect(component.snapshotOptions.map(option => option.dateKey)).toEqual(['2026-10-03', '2026-10-02']);
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('waits for concurrent restores, retains successful dates after partial failure, and retries only missing dates', async () => {
    const {component, sdk, storage, cache} = setup(), pending = deferred<void>();
    const second = {...cloud, id: 'cloud-B', snapshotDate: '2026-10-01', timestamp: new Date(2026, 9, 1, 12).getTime()};
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue([local, cloud, second]);
    storage.saveStatsHistory.mockImplementation(async snapshot => {
      if (snapshot.id === cloud.id) throw new Error('Isolated first restore failure');
      await pending.promise; cache.push(snapshot);
    });
    component.loadHistoryData(); await settle();
    expect(storage.saveStatsHistory).toHaveBeenCalledTimes(2);
    expect(component).toMatchObject({historyMetadataState: 'refreshing', historyData: [local]});
    pending.resolve(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'refresh-failed'});
    expect(component.snapshotOptions.map(option => option.dateKey)).toEqual(['2026-10-03', '2026-10-01']);
    storage.saveStatsHistory.mockImplementation(async snapshot => {cache.push(snapshot);});
    component.loadHistoryData(); await settle();
    expect(component).toMatchObject({historyMetadataState: 'ready', historyMetadataError: ''});
    expect(component.snapshotOptions.map(option => option.dateKey)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
    expect(storage.saveStatsHistory.mock.calls.map(([snapshot]) => snapshot.id)).toEqual(['cloud-A', 'cloud-B', 'cloud-A']);
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each(['resolve', 'reject'] as const)('does not publish a late local %s after leaving Stats', async outcome => {
    const {component, storage, sdk, render} = setup(), read = deferred<any[]>();
    storage.getStatsHistory.mockReturnValueOnce(read.promise);
    component.loadHistoryData(); component.ngOnDestroy(); render.markForCheck.mockClear();
    if (outcome === 'resolve') read.resolve([local]);
    else read.reject(new Error('Isolated abandoned local read'));
    await settle();
    expect(component.historyData).toEqual([]);
    expect(component.snapshotOptions).toEqual([]);
    expect(render.markForCheck).not.toHaveBeenCalled();
    expect(sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
  });

});
