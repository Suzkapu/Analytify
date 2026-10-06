import {afterEach, describe, expect, it, vi} from 'vitest';
import {UserStatsComponent} from './user-stats.component';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const local = {id: 'local-A', timestamp: new Date(2026, 9, 3, 12).getTime(), snapshotDate: '2026-10-03',
  topTracks: [{id: 'cached', name: 'Cached ranking'}], topArtists: [], topGenres: [], isLoaded: true};
const cloud = {id: 'cloud-A', timestamp: new Date(2026, 9, 2).getTime(), snapshotDate: '2026-10-02',
  topTracks: [], topArtists: [], topGenres: [], isLoaded: false};
function setup() {
  const account = {spotify: 'metadata-spotify-A', cloud: 'metadata-owner-A', sharedOwner: '', backup: true};
  const auth = {getUserId: () => account.spotify, getSupabaseUserId: () => account.cloud, isBackupActive: () => account.backup};
  const history = [{...local}];
  const storage = {getStatsHistory: vi.fn(async () => [...history]), deleteStatsHistoryEntries: vi.fn().mockResolvedValue(undefined),
    saveStatsHistory: vi.fn(async snapshot => {history.push(snapshot);})};
  const sdk = {loadAllStatsSnapshotsMetadata: vi.fn().mockResolvedValue([]), saveStatsSnapshot: vi.fn().mockResolvedValue(undefined),
    loadStatsSnapshotById: vi.fn().mockResolvedValue(null)};
  const component = new UserStatsComponent(null as never, auth as never, storage as never, sdk as never,
    {snapshot: {paramMap: {get: () => account.sharedOwner}}} as never);
  return {component, account, storage, sdk};
}
async function settle() {for (let i = 0; i < 20; i++) await Promise.resolve();}
afterEach(() => vi.restoreAllMocks());

describe('Stats metadata hydration ownership and reconciliation boundary', () => {
  it('keeps a real service permission failure from triggering uploads and recovers with an authorized inventory', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({data: [], error: {code: '42501', message: 'Isolated permission denial'}})};
    const client = {from: vi.fn().mockReturnValue(query)};
    const service = new SupabaseService(async () => client as never);
    const storage = {getStatsHistory: vi.fn().mockResolvedValue([local]), saveStatsHistory: vi.fn(), deleteStatsHistoryEntries: vi.fn()};
    const auth = {getUserId: () => 'metadata-spotify-A', getSupabaseUserId: () => 'metadata-owner-A', isBackupActive: () => true};
    const component = new UserStatsComponent(null as never, auth as never, storage as never, service);
    component.loadHistoryData(); await settle();
    expect(component.historyData).toEqual([local]);
    expect(client.from).toHaveBeenCalledExactlyOnceWith('stats_snapshots');
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledOnce();
    query.order.mockResolvedValueOnce({data: [{id: 'local-A', snapshot_date: '2026-10-03',
      created_at: '2026-10-03T12:00:00Z'}] as never, error: null as never});
    component.loadHistoryData(); await settle();
    expect(client.from.mock.calls).toEqual([['stats_snapshots'], ['stats_snapshots']]);
    expect(query.eq.mock.calls).toEqual([['user_id', 'metadata-owner-A'], ['range', 'short_term'],
      ['user_id', 'metadata-owner-A'], ['range', 'short_term']]);
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(component.historyData).toEqual([local]);
    component.ngOnDestroy();
  });

  it('retains cached dates and does not upload local snapshots after cloud inventory fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {component, storage, sdk} = setup();
    sdk.loadAllStatsSnapshotsMetadata.mockRejectedValue(new Error('Isolated metadata failure'));
    component.loadHistoryData(); await settle();
    expect(component.historyData).toEqual([local]);
    expect(component.snapshotOptions).toEqual([{id: String(local.timestamp), label: expect.any(String), dateKey: local.snapshotDate}]);
    expect(sdk.loadAllStatsSnapshotsMetadata).toHaveBeenCalledExactlyOnceWith('metadata-owner-A', 'short_term');
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue([local]);
    component.loadHistoryData(); await settle();
    expect(sdk.loadAllStatsSnapshotsMetadata).toHaveBeenCalledTimes(2);
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('uploads a retained local snapshot only after a genuinely empty cloud inventory succeeds', async () => {
    const {component, sdk, storage} = setup();
    component.loadHistoryData(); await settle();
    expect(sdk.saveStatsSnapshot).toHaveBeenCalledExactlyOnceWith('metadata-owner-A', 'short_term', 0, 0,
      local.topTracks, [], [], true, '2026-10-03');
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each(['cloud', 'spotify', 'sharedOwner'] as const)('discards old metadata after only the %s identity changes', async identity => {
    const {component, account, storage, sdk} = setup(), request = deferred<any[]>();
    sdk.loadAllStatsSnapshotsMetadata.mockReturnValue(request.promise);
    component.loadHistoryData(); await settle();
    expect(sdk.loadAllStatsSnapshotsMetadata).toHaveBeenCalledOnce();
    const visibleBefore = [...component.historyData];
    account[identity] = 'another-account';
    request.resolve([cloud]); await settle();
    expect(component.historyData).toEqual(visibleBefore);
    expect(storage.getStatsHistory).toHaveBeenCalledTimes(1);
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each(['cloud', 'spotify', 'sharedOwner'] as const)('does not display a late local cache or request cloud history after the %s identity changes', async identity => {
    const {component, account, storage, sdk} = setup(), request = deferred<any[]>();
    storage.getStatsHistory.mockReturnValue(request.promise);
    component.loadHistoryData();
    account[identity] = 'another-account';
    request.resolve([local]); await settle();
    expect(component.historyData).toEqual([]);
    expect(component.snapshotOptions).toEqual([]);
    expect(component.compareSnapshotId).toBe('');
    expect(sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('does not continue synchronization after teardown during local persistence', async () => {
    const {component, storage, sdk} = setup(), persist = deferred<void>();
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue([cloud]);
    storage.saveStatsHistory.mockReturnValue(persist.promise);
    component.loadHistoryData(); await settle();
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id: 'cloud-A', userId: 'metadata-spotify-A'}));
    component.ngOnDestroy(); persist.resolve(); await settle();
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    expect(storage.getStatsHistory).toHaveBeenCalledTimes(2);
  });

  it('does not reconcile late cloud metadata after backup is turned off', async () => {
    const {component, account, storage, sdk} = setup(), request = deferred<any[]>();
    sdk.loadAllStatsSnapshotsMetadata.mockReturnValue(request.promise);
    component.loadHistoryData(); await settle();
    expect(sdk.loadAllStatsSnapshotsMetadata).toHaveBeenCalledOnce();
    account.backup = false;
    request.resolve([cloud]); await settle();
    expect(component.historyData).toEqual([local]);
    expect(storage.getStatsHistory).toHaveBeenCalledTimes(1);
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each(['owner', 'backup'] as const)('does not start queued restores or uploads after %s changes while local writes are pending', async change => {
    const {component, account, storage, sdk} = setup(), persist = deferred<void>();
    sdk.loadAllStatsSnapshotsMetadata.mockResolvedValue(Array.from({length: 6}, (_, index) => ({...cloud,
      id: `cloud-${index}`, timestamp: new Date(2026, 8, 20 + index).getTime(), snapshotDate: `2026-09-${20 + index}`})));
    storage.saveStatsHistory.mockReturnValue(persist.promise);
    component.loadHistoryData(); await settle();
    expect(storage.saveStatsHistory).toHaveBeenCalledTimes(4);
    expect(storage.saveStatsHistory.mock.calls.every(([snapshot]) => snapshot.userId === 'metadata-spotify-A')).toBe(true);
    if (change === 'owner') account.spotify = 'metadata-spotify-B';
    else account.backup = false;
    persist.resolve(); await settle();
    // The four writes already started for A may finish; the next two must not start.
    expect(storage.saveStatsHistory).toHaveBeenCalledTimes(4);
    expect(sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    expect(storage.getStatsHistory).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  });
});
