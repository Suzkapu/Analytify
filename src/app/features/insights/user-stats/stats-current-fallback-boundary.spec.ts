import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}
type ReadResult = {data: any; error: {message: string} | null};
const song = {id: 'cached-song', name: 'Cached song', artists: [{name: 'Artist'}], album: {images: []}};
const artist = {id: 'cached-artist', name: 'Artist', genres: ['pop'], images: []};
function entries(name: string, timestamp = Date.now(), range = 'short_term') {
  return Object.entries({tracks: [{...song, name}], artists: [artist], genres: [{name: 'pop', count: 1, percentage: 100}], lastUpdated: String(timestamp)})
    .map(([part, value]) => ({key: `owner_stats_${range}_${part}`, value: typeof value === 'string' ? value : JSON.stringify(value)}));
}
function setup(cached = false) {
  const account = {spotify: 'owner', cloud: 'cloud-owner'};
  const cacheReads: ReturnType<typeof deferred<ReadResult>>[] = [], snapshotReads: ReturnType<typeof deferred<ReadResult>>[] = [];
  const queries: {table: string; eq: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn>; gte: ReturnType<typeof vi.fn>}[] = [];
  const from = vi.fn((table: string) => {
    const query: any = {eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({error: null}),
      maybeSingle: () => {const request = deferred<ReadResult>(); snapshotReads.push(request); return request.promise;},
      then: (resolve: any, reject: any) => {
        if (table !== 'user_cache') return Promise.resolve({data: [], error: null}).then(resolve, reject);
        const request = deferred<ReadResult>(); cacheReads.push(request); return request.promise.then(resolve, reject);
      }};
    queries.push({table, eq: query.eq, in: query.in, gte: query.gte}); return query;
  });
  const supabase = new SupabaseService(async () => ({from}) as never);
  const lifecycle = new SessionLifecycleService(), storage = new StorageService(supabase, lifecycle);
  // Persistence ports remain isolated; cache hydration/cloud adapter behavior is real.
  vi.spyOn(storage as any, 'persistKV').mockImplementation(() => {});
  vi.spyOn(storage as any, 'deleteKV').mockImplementation(() => {});
  vi.spyOn(storage, 'getStatsHistory').mockResolvedValue([]);
  const historyWrite = vi.spyOn(storage, 'saveStatsHistory').mockResolvedValue(undefined);
  storage.setItem('spotifyUserId', 'owner', false); storage.setItem('supabaseUserId', 'cloud-owner', false);
  storage.setItem('cloud-owner_backup_active', 'true', false);
  if (cached) for (const item of entries('Cached song', 1)) storage.setItem(item.key, item.value, false);
  const pages: Subject<{items: any[]}>[] = Array.from({length: 4}, () => new Subject());
  const spotify = {getUserTopArtists: vi.fn(() => pages[0]),
    getUserTopTracks: vi.fn((_range: string, _limit: number, offset: number) => pages[offset === 0 ? 1 : offset === 50 ? 2 : 3])};
  const component = new UserStatsComponent(spotify as never,
    {getUserId: () => account.spotify, getSupabaseUserId: () => account.cloud, isBackupActive: () => true} as never,
    storage, supabase);
  return {component, storage, supabase, lifecycle, account, cacheReads, snapshotReads, queries, pages, spotify, historyWrite};
}
async function settle() {for (let i = 0; i < 30; i++) await Promise.resolve();}
beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));});
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('current Stats composed storage/cloud fallback boundary', () => {
  it.each([false, true])('falls through denied cloud reads to Spotify and preserves complete cached data on final failure, cached=%s', async cached => {
    const h = setup(cached); const pending = h.component.loadStats(); await settle();
    expect(h.cacheReads).toHaveLength(1);
    h.cacheReads[0].resolve({data: null, error: {message: 'Isolated cache permission denial'}}); await settle();
    expect(h.snapshotReads).toHaveLength(1);
    h.snapshotReads[0].resolve({data: null, error: {message: 'Isolated snapshot permission denial'}}); await pending;
    expect(h.spotify.getUserTopArtists).toHaveBeenCalledExactlyOnceWith('short_term', 50, 0);
    expect(h.spotify.getUserTopTracks.mock.calls).toEqual([['short_term', 50, 0], ['short_term', 50, 50], ['short_term', 10, 100]]);
    expect(h.queries[0].eq).toHaveBeenCalledExactlyOnceWith('user_id', 'cloud-owner');
    expect(h.queries[0].in).toHaveBeenCalledExactlyOnceWith('key', entries('unused').map(x => x.key));
    expect(h.queries.find(q => q.gte.mock.calls.length)!.gte).toHaveBeenCalledExactlyOnceWith('snapshot_date', '2026-10-08');
    h.pages[0].error(new Error('Isolated Spotify failure')); await settle();
    expect(h.component).toMatchObject({isLoading: false, isRefreshingStats: false, currentStatsLoadFailed: true});
    expect(h.component.topTracks).toEqual(cached ? [song] : []); expect(h.historyWrite).not.toHaveBeenCalled();
    expect(h.storage.getItem('owner_stats_short_term_lastUpdated')).toBe(cached ? '1' : null);
    h.component.ngOnDestroy();
  });

  it('uses a complete fresh cloud cache without contacting Spotify or the normalized snapshot endpoint', async () => {
    const h = setup(); const pending = h.component.loadStats(); await settle();
    h.cacheReads[0].resolve({data: entries('Cloud song'), error: null}); await pending; await settle();
    expect(h.component.topTracks[0].name).toBe('Cloud song');
    expect(h.component).toMatchObject({isLoading: false, isRefreshingStats: false, currentStatsLoadFailed: false});
    expect(h.snapshotReads).toHaveLength(0); expect(h.spotify.getUserTopTracks).not.toHaveBeenCalled();
    expect(h.historyWrite).toHaveBeenCalledOnce(); h.component.ngOnDestroy();
  });

  for (const change of ['range', 'spotify', 'cloud', 'destroy'] as const) {
    it(`does not persist obsolete cloud cache entries after ${change} changes while restore is pending`, async () => {
      const h = setup(); const pending = h.component.loadStats(); await settle();
      if (change === 'range') h.component.selectedRange = 'long_term';
      else if (change === 'destroy') h.component.ngOnDestroy();
      else h.account[change] = 'replacement';
      h.cacheReads[0].resolve({data: entries('Obsolete cloud song'), error: null}); await pending; await settle();
      expect(h.component.topTracks).toEqual([]); expect(h.storage.getItem('owner_stats_short_term_tracks')).toBeNull();
      expect(h.storage.getItem('owner_stats_short_term_lastUpdated')).toBeNull();
      expect(h.historyWrite).not.toHaveBeenCalled(); expect(h.spotify.getUserTopTracks).not.toHaveBeenCalled();
      expect(h.snapshotReads).toHaveLength(0); if (change !== 'destroy') h.component.ngOnDestroy();
    });
  }

  it('does not let a late first restore overwrite a newer same-range complete cache', async () => {
    const h = setup(); const old = h.component.loadStats(); await settle();
    const current = h.component.loadStats(); await settle(); expect(h.cacheReads).toHaveLength(2);
    h.cacheReads[1].resolve({data: entries('Newest cloud song'), error: null}); await current;
    h.cacheReads[0].resolve({data: entries('Obsolete cloud song'), error: null}); await old; await settle();
    expect(h.component.topTracks[0].name).toBe('Newest cloud song');
    expect(JSON.parse(h.storage.getItem('owner_stats_short_term_tracks')!)[0].name).toBe('Newest cloud song');
    expect(h.historyWrite).toHaveBeenCalledOnce(); h.component.ngOnDestroy();
  });

  it('shows a complete expired cloud cache while refreshing and retains it if Spotify fails', async () => {
    const h = setup(); const pending = h.component.loadStats(); await settle();
    h.cacheReads[0].resolve({data: entries('Restored stale song', 1), error: null}); await settle();
    h.snapshotReads[0].resolve({data: null, error: null}); await pending;
    expect(h.component).toMatchObject({isLoading: false, isRefreshingStats: true});
    expect(h.component.topTracks[0]?.name).toBe('Restored stale song');
    h.pages[0].error(new Error('Isolated refresh failure')); await settle();
    expect(h.component).toMatchObject({isLoading: false, isRefreshingStats: false, currentStatsLoadFailed: true});
    expect(h.component.topTracks[0]?.name).toBe('Restored stale song'); expect(h.historyWrite).not.toHaveBeenCalled();
    expect(h.storage.getItem('owner_stats_short_term_lastUpdated')).toBe('1'); h.component.ngOnDestroy();
  });

  it.each([['broken-json', false, false], ['{"not":"an array"}', false, false], ['broken-json', true, false], ['broken-json', true, true]] as const)('retains a complete local cache when cloud restoration returns invalid tracks: %s, missing timestamp=%s, tracks only=%s', async (invalid, missingTimestamp, tracksOnly) => {
    const h = setup(true);
    if (tracksOnly) {
      h.storage.setItem('owner_stats_short_term_artists', '[]', false);
      h.storage.removeItem('owner_stats_short_term_genres');
    }
    if (missingTimestamp) h.storage.removeItem('owner_stats_short_term_lastUpdated');
    const pending = h.component.loadStats(); await settle();
    expect(h.component.topTracks).toEqual([song]);
    const cloudEntries = entries('Invalid cloud replacement');
    cloudEntries.find(item => item.key.endsWith('_tracks'))!.value = invalid;
    h.cacheReads[0].resolve({data: cloudEntries, error: null}); await settle();
    h.snapshotReads[0].resolve({data: null, error: null}); await pending;
    expect(h.component.topTracks).toEqual([song]);
    expect(h.component).toMatchObject({isLoading: false, isRefreshingStats: true});
    h.pages[0].error(new Error('Isolated recovery failure')); await settle();
    expect(h.component.topTracks).toEqual([song]);
    expect(h.component.currentStatsLoadFailed).toBe(true);
    expect(h.storage.getItem('owner_stats_short_term_lastUpdated')).toBe(missingTimestamp ? null : '1');
    expect(JSON.parse(h.storage.getItem('owner_stats_short_term_tracks')!)).toEqual([song]);
    expect(h.historyWrite).not.toHaveBeenCalled(); h.component.ngOnDestroy();
  });

  it.each(['short_term', 'long_term'])('uses a normalized cloud snapshot after cache miss for %s without Spotify fallback', async range => {
    const h = setup(); h.component.selectedRange = range; const pending = h.component.loadStats(); await settle();
    h.cacheReads[0].resolve({data: [], error: null}); await settle();
    h.snapshotReads[0].resolve({data: {snapshot_date: '2026-10-08', stats_snapshot_tracks: [{rank: 1,
      tracks: {id: 'cloud-song', name: 'Normalized song', track_artists: [], albums: null}}],
      stats_snapshot_artists: [], stats_snapshot_genres: [{rank: 1, genre_name: 'pop', weight: 100}]}, error: null});
    await pending; await settle();
    expect(h.component.topTracks[0]).toMatchObject({id: 'cloud-song', name: 'Normalized song'});
    expect(h.component.topGenres).toEqual([{name: 'pop', count: 100, percentage: 100}]);
    expect(h.component).toMatchObject({isLoading: false, isRefreshingStats: false, currentStatsLoadFailed: false});
    expect(JSON.parse(h.storage.getItem(`owner_stats_${range}_tracks`)!)[0].name).toBe('Normalized song');
    expect(h.spotify.getUserTopTracks).not.toHaveBeenCalled(); expect(h.historyWrite).toHaveBeenCalledOnce();
    const query = h.queries.find(q => q.gte.mock.calls.length)!;
    expect(query.eq.mock.calls).toEqual([['user_id', 'cloud-owner'], ['range', range]]);
    expect(query.gte).toHaveBeenCalledExactlyOnceWith('snapshot_date', range === 'short_term' ? '2026-10-08' : '2026-10-02');
    h.component.ngOnDestroy();
  });

  it('rejects a normalized cloud snapshot after the captured account changes', async () => {
    const h = setup(); const pending = h.component.loadStats(); await settle();
    h.cacheReads[0].resolve({data: [], error: null}); await settle(); h.account.cloud = 'replacement';
    h.snapshotReads[0].resolve({data: {snapshot_date: '2026-10-08', stats_snapshot_tracks: [{rank: 1,
      tracks: {id: 'private-song', name: 'Old account song', track_artists: []}}]}, error: null}); await pending;
    expect(h.component.topTracks).toEqual([]); expect(h.storage.getItem('owner_stats_short_term_tracks')).toBeNull();
    expect(h.spotify.getUserTopTracks).not.toHaveBeenCalled(); expect(h.historyWrite).not.toHaveBeenCalled();
    h.component.ngOnDestroy();
  });
});
