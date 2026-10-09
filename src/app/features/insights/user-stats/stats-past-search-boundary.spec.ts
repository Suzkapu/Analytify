import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const former = (id: string) => ({id, kind: 'track', name: id, subtitle: '', imageUrl: '', spotifyUrl: '', bestRank: 2, firstSeen: '', lastSeen: '', appearances: 1});
function setup() {
  const account = {sharedOwner: '', backup: true};
  const sdk = {searchPastTopItems: vi.fn()};
  const component = new UserStatsComponent(null as never, {getSupabaseUserId: () => 'owner', isBackupActive: () => account.backup} as never,
    null as never, sdk as never, {snapshot: {paramMap: {get: () => account.sharedOwner}}} as never);
  component.togglePastStatsSearch();
  return {component, sdk, account};
}
async function settle() {for (let index = 0; index < 4; index++) await Promise.resolve();}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('historical ranking search service boundaries', () => {
  it('replaces the period-scoped query once and rejects late results from the former period', async () => {
    const {component, sdk} = setup(), old = deferred<any[]>(), next = deferred<any[]>();
    vi.spyOn(component, 'loadStats').mockResolvedValue(undefined);
    vi.spyOn(component, 'loadHistoryData').mockResolvedValue(undefined);
    sdk.searchPastTopItems.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
    component.changeRange('medium_term'); component.changeRange('medium_term');
    vi.advanceTimersByTime(299);
    expect(sdk.searchPastTopItems.mock.calls).toEqual([['short_term', 'track', 'former']]);
    vi.advanceTimersByTime(1);
    expect(sdk.searchPastTopItems.mock.calls).toEqual([
      ['short_term', 'track', 'former'], ['medium_term', 'track', 'former']
    ]);
    next.resolve([former('new-period')]); await settle();
    old.resolve([former('old-period')]); await settle();
    expect(component.pastTopResults.map(item => item.id)).toEqual(['new-period']);
    expect(component.isSearchingPastStats).toBe(false);
    expect(component.selectedSnapshotId).toBe('current');
    expect(component.compareSnapshotId).toBe('');
    component.ngOnDestroy();
  });

  it('debounces a replacement query and ignores an older failure while the newer result remains busy', async () => {
    const {component, sdk} = setup(), old = deferred<any[]>(), next = deferred<any[]>();
    sdk.searchPastTopItems.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    component.onStatsSearchChange('old'); vi.advanceTimersByTime(300);
    component.onStatsSearchChange('new'); vi.advanceTimersByTime(299);
    expect(sdk.searchPastTopItems).toHaveBeenCalledExactlyOnceWith('short_term', 'track', 'old');
    vi.advanceTimersByTime(1);
    expect(sdk.searchPastTopItems).toHaveBeenLastCalledWith('short_term', 'track', 'new');
    old.reject(new Error('Old request failed')); await settle();
    expect(component.isSearchingPastStats).toBe(true);
    expect(component.pastStatsSearchError).toBe('');
    next.resolve([former('new')]); await settle();
    expect(component.pastTopResults.map(item => item.id)).toEqual(['new']);
    expect(component.isSearchingPastStats).toBe(false);
    component.ngOnDestroy();
  });

  it.each(['success', 'failure'])('switching off cancels visible work and rejects late %s without another request', async outcome => {
    const {component, sdk} = setup(), request = deferred<any[]>();
    sdk.searchPastTopItems.mockReturnValue(request.promise);
    component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
    component.togglePastStatsSearch();
    expect(component.includePastStatsSearch).toBe(false);
    expect(component.isSearchingPastStats).toBe(false);
    if (outcome === 'success') request.resolve([former('late')]); else request.reject(new Error('Late error'));
    await settle(); vi.advanceTimersByTime(1000);
    expect(component.pastTopResults).toEqual([]);
    expect(component.pastStatsSearchError).toBe('');
    expect(sdk.searchPastTopItems).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('category changes invalidate old results and exclude current identities from the new service result', async () => {
    const {component, sdk} = setup(), tracks = deferred<any[]>(), artists = deferred<any[]>();
    sdk.searchPastTopItems.mockReturnValueOnce(tracks.promise).mockReturnValueOnce(artists.promise);
    component.topArtists = [{id: 'current-artist', name: 'Current'}];
    component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
    component.changeCategory('artists'); vi.advanceTimersByTime(300);
    expect(sdk.searchPastTopItems).toHaveBeenLastCalledWith('short_term', 'artist', 'former');
    artists.resolve([former('current-artist'), former('former-artist')]); await settle();
    tracks.resolve([former('former-track')]); await settle();
    expect(component.pastTopResults.map(item => item.id)).toEqual(['former-artist']);
    expect(component.isSearchingPastStats).toBe(false);
    component.ngOnDestroy();
  });

  it('destroying the view cancels the debounce and prevents in-flight results from reappearing', async () => {
    const first = setup(), request = deferred<any[]>();
    first.sdk.searchPastTopItems.mockReturnValue(request.promise);
    first.component.onStatsSearchChange('former'); vi.advanceTimersByTime(300);
    first.component.ngOnDestroy(); request.resolve([former('late')]); await settle();
    expect(first.component.pastTopResults).toEqual([]);
    const next = setup(); next.component.onStatsSearchChange('pending'); next.component.ngOnDestroy(); vi.advanceTimersByTime(1000);
    expect(next.sdk.searchPastTopItems).not.toHaveBeenCalled();
  });

  it('does not query private history in shared or selected historical views, or for a one-character query', () => {
    for (const context of ['shared', 'historical', 'short']) {
      const {component, sdk, account} = setup();
      if (context === 'shared') account.sharedOwner = 'other-owner';
      if (context === 'historical') component.selectedSnapshotId = 'saved-date';
      component.onStatsSearchChange(context === 'short' ? 'x' : 'former');
      vi.advanceTimersByTime(1000);
      expect(sdk.searchPastTopItems).not.toHaveBeenCalled();
      expect(component.pastTopResults).toEqual([]);
      expect(component.isSearchingPastStats).toBe(false);
      component.ngOnDestroy();
    }
  });
});
