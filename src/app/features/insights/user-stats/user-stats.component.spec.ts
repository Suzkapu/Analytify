import {UserStatsComponent} from './user-stats.component';
import {NEVER} from 'rxjs';

describe('UserStatsComponent trends', () => {
  let component: UserStatsComponent;

  const makeSnapshot = (
    date: string,
    topTracks: any[] = [],
    topArtists: any[] = [],
    topGenres: any[] = [],
    isLoaded: boolean | 'loading' = true
  ) => ({
    timestamp: new Date(`${date}T12:00:00`).getTime(),
    snapshotDate: date,
    topTracks,
    topArtists,
    topGenres,
    isLoaded
  });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-08-02T12:00:00'));
    component = new UserStatsComponent(
      null as any,
      null as any,
      null as any,
      null as any
    );
    component.selectedSnapshotId = 'current';
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('matches local and cloud track shapes instead of marking an existing song as new', () => {
    const previous = makeSnapshot('2026-07-30', [
      {name: 'Other song', artist: 'Other artist'},
      {name: '  Shared Song ', artists: [{name: 'The Artist'}]}
    ]);
    component.historyData = [previous];
    component.compareSnapshotId = previous.timestamp.toString();

    const trend = component.getTrend(
      {name: 'shared song', artist: ' the artist '},
      0,
      'tracks'
    );

    expect(trend).toEqual({type: 'up', diff: 1});
  });

  it('matches relinked Spotify tracks by either known id', () => {
    const previous = makeSnapshot('2026-07-30', [
      {id: 'market-version', linked_from: {id: 'original-version'}, name: 'Song', artists: [{name: 'Artist'}]}
    ]);
    component.historyData = [previous];
    component.compareSnapshotId = previous.timestamp.toString();

    expect(component.getTrend(
      {id: 'original-version', name: 'Song', artists: [{name: 'Artist'}]},
      0,
      'tracks'
    )).toEqual({type: 'same'});
  });

  it('does not mark a returning song as new when it exists in an older snapshot', () => {
    const older = makeSnapshot('2026-07-29', [
      {name: 'Returning Song', artist: 'Artist'}
    ]);
    const comparison = makeSnapshot('2026-07-30', [
      {name: 'Different Song', artist: 'Artist'}
    ]);
    component.historyData = [older, comparison];
    component.compareSnapshotId = comparison.timestamp.toString();

    expect(component.getTrend(
      {name: 'Returning Song', artists: [{name: 'Artist'}]},
      0,
      'tracks'
    )).toEqual({type: 'same'});
  });

  it('marks a song as new only when every earlier loaded snapshot confirms no appearance', () => {
    const older = makeSnapshot('2026-07-29', [
      {name: 'Older Song', artist: 'Artist'}
    ]);
    const comparison = makeSnapshot('2026-07-30', [
      {name: 'Different Song', artist: 'Artist'}
    ]);
    component.historyData = [older, comparison];
    component.compareSnapshotId = comparison.timestamp.toString();

    expect(component.getTrend(
      {name: 'Actually New', artists: [{name: 'Artist'}]},
      0,
      'tracks'
    )).toEqual({type: 'new'});
  });

  it('waits for earlier snapshot details before showing a new marker', () => {
    const unloaded = makeSnapshot('2026-07-29', [], [], [], false);
    const comparison = makeSnapshot('2026-07-30', [
      {name: 'Different Song', artist: 'Artist'}
    ]);
    component.historyData = [unloaded, comparison];
    component.compareSnapshotId = comparison.timestamp.toString();

    expect(component.getTrend(
      {name: 'Potentially Existing', artists: [{name: 'Artist'}]},
      0,
      'tracks'
    )).toEqual({type: 'same'});
  });

  it('keeps up and down chronological when snapshots are selected in reverse order', () => {
    const selected = makeSnapshot('2026-07-30', [
      ...Array.from({length: 9}, (_, index) => ({name: `Song ${index}`, artist: 'Artist'})),
      {id: 'moving-song', name: 'Moving Song', artist: 'Artist'}
    ]);
    component.historyData = [selected];
    component.selectedSnapshotId = selected.timestamp.toString();
    component.compareSnapshotId = 'current';
    component.topTracks = [
      {name: 'Other Song', artists: [{name: 'Artist'}]},
      {id: 'moving-song', name: 'Moving Song', artists: [{name: 'Artist'}]}
    ];

    expect(component.getTrend(selected.topTracks[9], 9, 'tracks'))
      .toEqual({type: 'up', diff: 8});
  });

  it('uses the same normalized identity rules for artists and genres', () => {
    const previous = makeSnapshot(
      '2026-07-30',
      [],
      [{name: 'Other'}, {name: 'Massive Attack'}],
      ['Other Genre', 'Alternative Rock']
    );
    component.historyData = [previous];
    component.compareSnapshotId = previous.timestamp.toString();

    expect(component.getTrend({name: ' massive  attack '}, 0, 'artists'))
      .toEqual({type: 'up', diff: 1});
    expect(component.getTrend({name: 'alternative rock'}, 0, 'genres'))
      .toEqual({type: 'up', diff: 1});
  });

  it('keeps medium and long-term stats fresh for seven days', () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;

    expect(component.isCacheExpired(String(sixDaysAgo), 'medium_term')).toBeFalse();
    expect(component.isCacheExpired(String(sixDaysAgo), 'long_term')).toBeFalse();
    expect(component.isCacheExpired(String(eightDaysAgo), 'medium_term')).toBeTrue();
  });

  it('starts current stats first and defers history without waiting for account hydration', () => {
    const auth = {
      isAuthenticated: () => true,
      ensureInitialSync: () => new Promise<void>(() => {}),
      isBackupActive: () => false
    };
    const immediateComponent = new UserStatsComponent(
      null as any,
      auth as any,
      null as any,
      null as any
    );
    const loadHistory = spyOn(immediateComponent, 'loadHistoryData');
    const loadStats = spyOn(immediateComponent, 'loadStats').and.resolveTo();

    immediateComponent.ngOnInit();

    expect(loadStats).toHaveBeenCalledTimes(1);
    expect(loadHistory).not.toHaveBeenCalled();

    jasmine.clock().tick(500);

    expect(loadHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps complete stale current stats visible while its parallel refresh is pending', async () => {
    const values: Record<string, string> = {
      'user_stats_short_term_tracks': JSON.stringify([{id: 'cached-track'}]),
      'user_stats_short_term_artists': JSON.stringify([{id: 'cached-artist'}]),
      'user_stats_short_term_genres': JSON.stringify([{name: 'cached-genre'}]),
      'user_stats_short_term_lastUpdated': '1'
    };
    const spotify = {
      getUserTopArtists: jasmine.createSpy('getUserTopArtists').and.returnValue(NEVER),
      getUserTopTracks: jasmine.createSpy('getUserTopTracks').and.returnValue(NEVER)
    };
    const staleComponent = new UserStatsComponent(
      spotify as any,
      {
        getUserId: () => 'user',
        getSupabaseUserId: () => null,
        isBackupActive: () => false
      } as any,
      {getItem: (key: string) => values[key] ?? null} as any,
      null as any
    );

    await staleComponent.loadStats();

    expect(staleComponent.topTracks.map(track => track.id)).toEqual(['cached-track']);
    expect(staleComponent.topArtists.map(artist => artist.id)).toEqual(['cached-artist']);
    expect(staleComponent.topGenres.map(genre => genre.name)).toEqual(['cached-genre']);
    expect(staleComponent.isLoading).toBeTrue();
    expect(spotify.getUserTopArtists).toHaveBeenCalledTimes(1);
    expect(spotify.getUserTopTracks).toHaveBeenCalledTimes(2);
  });

  it('loads one item trend instead of every historical Top list', async () => {
    const supabase = {
      loadStatsItemTrend: jasmine.createSpy('loadStatsItemTrend').and.resolveTo([{
        timestamp: new Date('2026-08-01T12:00:00').getTime(),
        snapshotDate: '2026-08-01',
        rank: 4
      }]),
      loadAllStatsSnapshots: jasmine.createSpy('loadAllStatsSnapshots')
    };
    const trendComponent = new UserStatsComponent(
      null as any,
      {
        getSupabaseUserId: () => 'user-id',
        isBackupActive: () => true
      } as any,
      null as any,
      supabase as any
    );
    trendComponent.historyData = [makeSnapshot('2026-08-01', [], [], [], false)];

    await trendComponent.openTrendPopup({id: 'track-id', name: 'Track'}, 'tracks');

    expect(supabase.loadStatsItemTrend).toHaveBeenCalledOnceWith(
      'user-id',
      'short_term',
      'tracks',
      ['track-id']
    );
    expect(supabase.loadAllStatsSnapshots).not.toHaveBeenCalled();
    expect(trendComponent.trendPopupPoints.map(point => point.rank)).toEqual([4]);
  });

  it('treats a genuinely new Top 10 song as a blue-flame hot debut', () => {
    const previous = makeSnapshot('2026-08-01', [
      {id: 'older-track', name: 'Older Track', artists: [{name: 'Artist'}]}
    ]);
    component.historyData = [previous];
    component.compareSnapshotId = previous.timestamp.toString();
    component.topTracks = Array.from({length: 11}, (_, index) => ({
      id: `new-${index}`,
      name: `New Song ${index}`,
      artists: [{name: 'Artist'}]
    }));

    component.calculateHotMovers();

    expect(component.isHotMover(component.topTracks[0], 'tracks')).toBeTrue();
    expect(component.isHighDebutHotSong(component.topTracks[0])).toBeTrue();
    expect(component.isHighDebutHotSong(component.topTracks[9])).toBeTrue();
    expect(component.isHotMover(component.topTracks[10], 'tracks')).toBeFalse();
    expect(component.isHighDebutHotSong(component.topTracks[10])).toBeFalse();
  });

  it('treats a genuinely new Top 10 artist as a blue-flame hot debut', () => {
    const previous = makeSnapshot(
      '2026-08-01',
      [],
      [{id: 'older-artist', name: 'Older Artist'}]
    );
    component.historyData = [previous];
    component.compareSnapshotId = previous.timestamp.toString();
    component.topArtists = Array.from({length: 11}, (_, index) => ({
      id: `new-artist-${index}`,
      name: `New Artist ${index}`
    }));

    component.calculateHotMovers();

    expect(component.isHotMover(component.topArtists[0], 'artists')).toBeTrue();
    expect(component.isHighDebutHotArtist(component.topArtists[0])).toBeTrue();
    expect(component.isHighDebutHotArtist(component.topArtists[9])).toBeTrue();
    expect(component.isHotMover(component.topArtists[10], 'artists')).toBeFalse();
    expect(component.isHighDebutHotArtist(component.topArtists[10])).toBeFalse();
  });

  it('shares one ten-entry flame pool between high debuts and rising movers', () => {
    component.topTracks = Array.from({length: 12}, (_, index) => ({
      id: `candidate-${index}`,
      name: `Candidate ${index}`,
      artists: [{name: 'Artist'}],
      testTrend: index < 6
        ? {type: 'new' as const}
        : {type: 'up' as const, diff: 100 - index}
    }));
    spyOn(component, 'getTrend').and.callFake((item: any) => item.testTrend);
    component.historyData = [makeSnapshot('2026-08-01')];

    component.calculateHotMovers();

    expect(component.hotMoverTracks.size).toBe(10);
    expect(component.highDebutTracks.size).toBe(6);
    expect(component.isHotMover(component.topTracks[9], 'tracks')).toBeTrue();
    expect(component.isHotMover(component.topTracks[10], 'tracks')).toBeFalse();
  });

  it('scores a new entry from below rank 100 so it can displace a slower existing mover', () => {
    component.topTracks = [
      {
        id: 'new-number-one',
        name: 'New Number One',
        artists: [{name: 'Artist'}],
        testTrend: {type: 'new' as const}
      },
      ...Array.from({length: 10}, (_, index) => ({
        id: `existing-${index}`,
        name: `Existing ${index}`,
        artists: [{name: 'Artist'}],
        testTrend: {type: 'up' as const, diff: 99 - index}
      }))
    ];
    spyOn(component, 'getTrend').and.callFake((item: any) => item.testTrend);
    component.historyData = [makeSnapshot('2026-08-01')];

    component.calculateHotMovers();

    expect(component.isHotMover(component.topTracks[0], 'tracks')).toBeTrue();
    expect(component.isHotMover(component.topTracks[10], 'tracks')).toBeFalse();
  });

  it('opens item history with both keyboard activation keys', () => {
    const item = {id: 'keyboard-track', name: 'Keyboard Track'};
    const openTrendPopup = spyOn(component, 'openTrendPopup').and.resolveTo();
    const enterEvent = new KeyboardEvent('keydown', {key: 'Enter', cancelable: true});
    const spaceEvent = new KeyboardEvent('keydown', {key: ' ', cancelable: true});

    component.onTrendCardKeydown(enterEvent, item, 'tracks');
    component.onTrendCardKeydown(spaceEvent, item, 'tracks');

    expect(openTrendPopup).toHaveBeenCalledTimes(2);
    expect(openTrendPopup).toHaveBeenCalledWith(item, 'tracks');
    expect(enterEvent.defaultPrevented).toBeTrue();
    expect(spaceEvent.defaultPrevented).toBeTrue();
  });

  it('ignores unrelated keys on history cards', () => {
    const openTrendPopup = spyOn(component, 'openTrendPopup').and.resolveTo();

    component.onTrendCardKeydown(
      new KeyboardEvent('keydown', {key: 'ArrowDown'}),
      {name: 'Track'},
      'tracks'
    );

    expect(openTrendPopup).not.toHaveBeenCalled();
  });

  it('searches Top Songs by song or artist while preserving the real rank', () => {
    component.topTracks = [
      {id: 'first', name: 'First Song', artists: [{name: 'Someone Else'}]},
      {id: 'wanted', name: 'Midnight City', artists: [{name: 'M83'}]},
      {id: 'third', name: 'Third Song', artists: [{name: 'Another Artist'}]}
    ];

    component.statsSearchQuery = 'm83';

    expect(component.filteredTracks.map(track => track.id)).toEqual(['wanted']);
    expect(component.getStatsRankIndex(component.filteredTracks[0], 'tracks')).toBe(1);

    component.statsSearchQuery = 'midnight';
    expect(component.filteredTracks.map(track => track.id)).toEqual(['wanted']);
  });

  it('searches Top Artists case-insensitively and can clear the query', () => {
    component.topArtists = [
      {id: 'one', name: 'Massive Attack'},
      {id: 'two', name: 'Portishead'}
    ];
    component.statsSearchQuery = 'PORTIS';

    expect(component.filteredArtists.map(artist => artist.id)).toEqual(['two']);
    expect(component.isStatsSearchActive).toBeTrue();

    component.clearStatsSearch();
    expect(component.filteredArtists.length).toBe(2);
    expect(component.isStatsSearchActive).toBeFalse();
  });
});
