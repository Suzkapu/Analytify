import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BehaviorSubject, of} from 'rxjs';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const former = (id: string) => ({id, kind: 'track' as const, name: id, subtitle: '', imageUrl: '', spotifyUrl: '', bestRank: 2, firstSeen: '', lastSeen: '', appearances: 1});
async function settle() {for (let index = 0; index < 20; index++) await Promise.resolve();}
function setup() {
  const account = {spotify: 'owner', cloud: 'owner-cloud', backup: true};
  const initialSync = deferred<void>();
  const params = new BehaviorSubject<{get: (key: string) => string}>({get: () => ''});
  const sdk = {searchPastTopItems: vi.fn(), loadAllStatsSnapshotsMetadata: vi.fn().mockResolvedValue([]), saveStatsSnapshot: vi.fn()};
  const storage = {hydrateItems: vi.fn().mockResolvedValue(undefined), getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(), getStatsHistory: vi.fn().mockResolvedValue([]), saveStatsHistory: vi.fn().mockResolvedValue(undefined)};
  const spotify = {getUserTopTracks: vi.fn(() => of({items: []})), getUserTopArtists: vi.fn(() => of({items: []}))};
  const sharing = {loadSharedStats: vi.fn().mockResolvedValue(null)};
  const component = new UserStatsComponent(spotify as never, {
    getUserId: () => account.spotify, getSupabaseUserId: () => account.cloud, isBackupActive: () => account.backup,
    isAuthenticated: () => true, ensureInitialSync: () => initialSync.promise
  } as never, storage as never, sdk as never,
  {paramMap: params, snapshot: {paramMap: {get: () => ''}}} as never, sharing as never);
  return {component, account, initialSync, params, sdk, storage, sharing};
}
beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));});
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('Stats public lifecycle and historical-search boundaries', () => {
  it.each(['spotify', 'cloud', 'backup'] as const)('rejects pending private search after %s access changes and permits recovery', async identity => {
    const h = setup(), old = deferred<ReturnType<typeof former>[]>();
    h.sdk.searchPastTopItems.mockReturnValueOnce(old.promise).mockResolvedValueOnce([former('replacement-history')]);
    h.component.togglePastStatsSearch(); h.component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
    if (identity === 'backup') h.account.backup = false;
    else h.account[identity] = 'replacement';
    old.resolve([former('former-owner-private-history')]); await settle();
    expect(h.component.pastTopResults).toEqual([]);
    expect(h.component.pastStatsSearchError).toBe('');
    expect(h.component.isSearchingPastStats).toBe(false);
    h.account.backup = true;
    h.component.onStatsSearchChange('replacement'); vi.advanceTimersByTime(300); await settle();
    expect(h.component.pastTopResults.map(item => item.id)).toEqual(['replacement-history']);
    expect(h.sdk.searchPastTopItems.mock.calls).toEqual([
      ['short_term', 'track', 'former'], ['short_term', 'track', 'replacement']
    ]);
    h.component.ngOnDestroy();
  });


  for (const identity of ['spotify', 'cloud', 'backup'] as const) {
    it(`rejects an old ${identity} search failure and permits replacement search`, async () => {
      const h = setup(), old = deferred<ReturnType<typeof former>[]>(), current = deferred<ReturnType<typeof former>[]>();
      h.sdk.searchPastTopItems.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      h.component.togglePastStatsSearch(); h.component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
      if (identity === 'backup') h.account.backup = false;
      else h.account[identity] = 'replacement';
      old.reject(new Error('Former private account failure')); await settle();
      expect(h.component.pastTopResults).toEqual([]);
      expect(h.component.pastStatsSearchError).toBe('');
      expect(h.component.isSearchingPastStats).toBe(false);
      h.account.backup = true;
      h.component.onStatsSearchChange('replacement'); vi.advanceTimersByTime(300);
      expect(h.component.isSearchingPastStats).toBe(true);
      current.resolve([former('replacement-result')]); await settle();
      expect(h.component.pastTopResults.map(item => item.id)).toEqual(['replacement-result']);
      expect(h.component.isSearchingPastStats).toBe(false);
      h.component.ngOnDestroy();
    });
  }

  it('does not let an old owner completion clear a newer owner search busy state', async () => {
    const h = setup(), old = deferred<ReturnType<typeof former>[]>(), current = deferred<ReturnType<typeof former>[]>();
    h.sdk.searchPastTopItems.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    h.component.togglePastStatsSearch(); h.component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
    h.account.cloud = 'replacement';
    h.component.onStatsSearchChange('replacement'); vi.advanceTimersByTime(300);
    old.reject(new Error('Former owner failed')); await settle();
    expect(h.component.isSearchingPastStats).toBe(true);
    expect(h.component.pastStatsSearchError).toBe('');
    current.resolve([former('current')]); await settle();
    expect(h.component.pastTopResults.map(item => item.id)).toEqual(['current']);
    expect(h.component.isSearchingPastStats).toBe(false);
    h.component.ngOnDestroy();
  });

  it.each([new Error('Temporary history outage'), {}])('clears stale results on current search failure and recovers through a new query: %s', async failure => {
    const h = setup();
    h.sdk.searchPastTopItems.mockResolvedValueOnce([former('previous')]).mockRejectedValueOnce(failure).mockResolvedValueOnce([former('recovered')]);
    h.component.togglePastStatsSearch(); h.component.onStatsSearchChange('previous'); vi.advanceTimersByTime(300); await settle();
    expect(h.component.pastTopResults.map(item => item.id)).toEqual(['previous']);
    h.component.onStatsSearchChange('failed'); vi.advanceTimersByTime(300); await settle();
    expect(h.component.pastTopResults).toEqual([]);
    expect(h.component.pastStatsSearchError).toBe(failure instanceof Error ? failure.message : 'Saved ranking history could not be searched.');
    expect(h.component.isSearchingPastStats).toBe(false);
    h.component.onStatsSearchChange('retry'); vi.advanceTimersByTime(300); await settle();
    expect(h.component.pastTopResults.map(item => item.id)).toEqual(['recovered']);
    expect(h.component.pastStatsSearchError).toBe('');
    expect(h.sdk.searchPastTopItems).toHaveBeenCalledTimes(3);
    h.component.ngOnDestroy();
  });

  it('discovers newly enabled backup after hydration on the still-active own Stats route', async () => {
    const h = setup(); h.account.backup = false;
    h.component.ngOnInit(); await settle(); vi.advanceTimersByTime(500); await settle();
    expect(h.sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    h.account.backup = true; h.initialSync.resolve(); await settle(); vi.advanceTimersByTime(500); await settle();
    expect(h.sdk.loadAllStatsSnapshotsMetadata).toHaveBeenCalledExactlyOnceWith('owner-cloud', 'short_term');
    expect(h.component.historyMetadataState).toBe('empty');
    h.component.ngOnDestroy();
  });

  it.each(['destroyed', 'shared'] as const)('does not restart private history after late account hydration in a %s view', async destination => {
    const h = setup(); h.account.backup = false;
    h.component.ngOnInit(); await settle(); vi.advanceTimersByTime(500); await settle();
    expect(h.storage.getStatsHistory).toHaveBeenCalled();
    if (destination === 'destroyed') h.component.ngOnDestroy();
    else {h.params.next({get: () => 'shared-owner'}); await settle();}
    const beforeReads = h.storage.getStatsHistory.mock.calls.length;
    h.account.backup = true; h.initialSync.resolve(); await settle(); vi.advanceTimersByTime(500); await settle();
    expect(h.storage.getStatsHistory).toHaveBeenCalledTimes(beforeReads);
    expect(h.sdk.loadAllStatsSnapshotsMetadata).not.toHaveBeenCalled();
    expect(h.sdk.saveStatsSnapshot).not.toHaveBeenCalled();
    if (destination === 'shared') {
      expect(h.sharing.loadSharedStats).toHaveBeenCalledExactlyOnceWith('shared-owner', 'short_term');
      h.component.ngOnDestroy();
    }
  });
});
