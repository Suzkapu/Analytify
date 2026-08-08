import {UserStatsComponent} from './user-stats.component';

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
});
