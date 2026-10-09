import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';
import {UserStatsComponent} from './user-stats.component';
import {V2UserStatsComponent} from './v2-user-stats.component';

const cachedTrack = {id: 'cached-song', name: 'Cached song', artists: [{name: 'Cached artist'}], album: {images: []}};
const cachedArtist = {id: 'cached-artist', name: 'Cached artist', genres: ['pop'], images: []};
function setup(cached = false, preview = false) {
  const values = new Map<string, string>();
  if (cached) for (const [part, value] of Object.entries({tracks: [cachedTrack], artists: [cachedArtist], genres: [{name: 'pop', count: 1, percentage: 100}], lastUpdated: '1'}))
    values.set(`owner_stats_short_term_${part}`, typeof value === 'string' ? value : JSON.stringify(value));
  const account = {spotify: 'owner', cloud: null as string | null};
  const storage = {hydrateItems: vi.fn().mockResolvedValue(undefined), getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {values.set(key, value);}),
    getStatsHistory: vi.fn().mockResolvedValue([]), saveStatsHistory: vi.fn().mockResolvedValue(undefined)};
  const batches: Subject<{items: any[]}>[][] = [];
  const spotify = {
    getUserTopArtists: vi.fn(() => {const batch = Array.from({length: 4}, () => new Subject<{items: any[]}>()); batches.push(batch); return batch[0];}),
    getUserTopTracks: vi.fn((_range: string, _limit: number, offset: number) => batches.at(-1)![offset === 0 ? 1 : offset === 50 ? 2 : 3])
  };
  const Controller = preview ? V2UserStatsComponent : UserStatsComponent;
  const component = new Controller(spotify as never,
    {getUserId: () => account.spotify, getSupabaseUserId: () => account.cloud, isBackupActive: () => false} as never,
    storage as never, null as never);
  return {component, storage, spotify, batches, values, account};
}
function finish(batch: Subject<{items: any[]}>[], items: any[][] = [[], [], [], []]) {
  batch.forEach((request, index) => {request.next({items: items[index]}); request.complete();});
}
async function settle() {for (let i = 0; i < 12; i++) await Promise.resolve();}
beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));});
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('current Stats retrieval service boundary', () => {
  it('commits only after every required page succeeds, preserving complete cached rankings while busy', async () => {
    const {component, storage, batches} = setup(true); await component.loadStats();
    expect(component).toMatchObject({isLoading: false, isRefreshingStats: true, topTracks: [cachedTrack], topArtists: [cachedArtist]});
    for (const i of [0, 1, 2]) {batches[0][i].next({items: i === 0 ? [{...cachedArtist, name: 'Fresh artist'}] : i === 1 ? [{...cachedTrack, name: 'Fresh song'}] : []}); batches[0][i].complete();}
    await settle(); expect(component.topTracks).toEqual([cachedTrack]); expect(storage.setItem).not.toHaveBeenCalled();
    batches[0][3].next({items: []}); batches[0][3].complete(); await settle();
    expect(component).toMatchObject({isLoading: false, isRefreshingStats: false});
    expect(component.topTracks[0].name).toBe('Fresh song'); expect(component.topArtists[0].name).toBe('Fresh artist');
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId: 'owner', range: 'short_term', topTracks: [expect.objectContaining({name: 'Fresh song'})]}));
    component.ngOnDestroy();
  });

  for (const cached of [false, true]) for (const endpoint of [0, 1, 2, 3]) {
    it(`does not persist partial results when required endpoint ${endpoint} fails, cached=${cached}`, async () => {
      const {component, storage, batches, values} = setup(cached); const before = new Map(values); await component.loadStats();
      batches[0][endpoint].error(new Error('Isolated current Stats failure')); await settle();
      expect(component).toMatchObject({isLoading: false, isRefreshingStats: false});
      expect(component).toHaveProperty('currentStatsLoadFailed', true);
      expect(component.topTracks).toEqual(cached ? [cachedTrack] : []);
      expect(component.topArtists).toEqual(cached ? [cachedArtist] : []);
      expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.saveStatsHistory).not.toHaveBeenCalled(); expect(values).toEqual(before);
      component.ngOnDestroy();
    });
  }

  it('persists genuinely empty success as an empty cache, independently of failed retrieval', async () => {
    const {component, storage, batches, values} = setup(); await component.loadStats(); finish(batches[0]); await settle();
    expect(component).toMatchObject({isLoading: false, isRefreshingStats: false, topTracks: [], topArtists: [], topGenres: []});
    for (const part of ['tracks', 'artists', 'genres']) expect(values.get(`owner_stats_short_term_${part}`)).toBe('[]');
    expect(values.get('owner_stats_short_term_lastUpdated')).toBe(String(Date.now()));
    expect(storage.saveStatsHistory).not.toHaveBeenCalled(); component.ngOnDestroy();
  });

  it('recovers after a failed attempt without committing its partial data or duplicate history', async () => {
    const {component, storage, batches, spotify} = setup(); await component.loadStats(); batches[0][1].error(new Error('Isolated offline failure')); await settle();
    await component.loadStats(); finish(batches[1], [[cachedArtist], [cachedTrack], [], []]); await settle();
    expect(component.topTracks).toEqual([cachedTrack]); expect(component.isLoading).toBe(false);
    expect(component).toHaveProperty('currentStatsLoadFailed', false);
    expect(spotify.getUserTopArtists).toHaveBeenCalledTimes(2); expect(spotify.getUserTopTracks).toHaveBeenCalledTimes(6);
    expect(storage.saveStatsHistory).toHaveBeenCalledOnce(); component.ngOnDestroy();
  });

  it('rejects old range results after a new range request has committed', async () => {
    const {component, storage, batches} = setup(); await component.loadStats(); component.selectedRange = 'long_term'; await component.loadStats();
    finish(batches[1], [[cachedArtist], [cachedTrack], [], []]); await settle(); const writes = storage.setItem.mock.calls.slice();
    finish(batches[0], [[{...cachedArtist, name: 'Old artist'}], [{...cachedTrack, name: 'Old song'}], [], []]); await settle();
    expect(component.topTracks).toEqual([cachedTrack]); expect(component.selectedRange).toBe('long_term');
    expect(storage.setItem.mock.calls).toEqual(writes); expect(storage.saveStatsHistory).toHaveBeenCalledOnce(); component.ngOnDestroy();
  });

  it('rejects all late responses when destroyed during initial loading', async () => {
    const {component, storage, batches} = setup(); await component.loadStats(); component.ngOnDestroy();
    finish(batches[0], [[cachedArtist], [cachedTrack], [], []]); await settle();
    expect(component.topTracks).toEqual([]); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.saveStatsHistory).not.toHaveBeenCalled();
  });

  it('does not display or persist a previous Spotify account after hydration resolves for the replacement account', async () => {
    const {component, storage, batches, account} = setup(); let release!: () => void;
    storage.hydrateItems.mockReturnValue(new Promise<void>(resolve => {release = resolve;}));
    const pending = component.loadStats(); account.spotify = 'replacement'; release(); await pending;
    if (batches.length) finish(batches[0], [[cachedArtist], [cachedTrack], [], []]); await settle();
    expect(component.topTracks).toEqual([]); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.saveStatsHistory).not.toHaveBeenCalled(); component.ngOnDestroy();
  });

  it.each(['spotify', 'cloud'] as const)('rejects previous-account API completion after the %s identity changes', async identity => {
    const {component, storage, batches, account} = setup(); await component.loadStats();
    account[identity] = 'replacement'; finish(batches[0], [[cachedArtist], [cachedTrack], [], []]); await settle();
    expect(component.topTracks).toEqual([]); expect(component.topArtists).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.saveStatsHistory).not.toHaveBeenCalled(); component.ngOnDestroy();
  });

  it.each([false, true])('retries a failed same-range load once while hydration and required pages remain pending, cached=%s', async cached => {
    const {component, storage, batches, spotify} = setup(cached, true);
    await component.loadStats(); batches[0][0].error(new Error('Isolated failure')); await settle();
    let release!: () => void;
    storage.hydrateItems.mockReturnValue(new Promise<void>(resolve => {release = resolve;}));
    (component as any).retryCurrentStats?.(); (component as any).retryCurrentStats?.();
    expect(component.isLoading || component.isRefreshingStats).toBe(true);
    release(); await settle();
    expect(spotify.getUserTopArtists).toHaveBeenCalledTimes(2);
    (component as any).retryCurrentStats?.();
    expect(spotify.getUserTopArtists).toHaveBeenCalledTimes(2);
    finish(batches[1], [[cachedArtist], [cachedTrack], [], []]); await settle();
    expect(component.topTracks).toEqual([cachedTrack]); expect(component).toHaveProperty('currentStatsLoadFailed', false);
    expect(storage.saveStatsHistory).toHaveBeenCalledOnce(); component.ngOnDestroy();
  });

});
