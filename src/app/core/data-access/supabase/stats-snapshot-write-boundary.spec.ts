import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SupabaseService} from './supabase.service';

describe('Stats snapshot write service boundary', () => {
  beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-06T12:00:00'));});
  afterEach(() => {vi.useRealTimers();vi.restoreAllMocks();});

  function setup() {
    const catalogs = new Map<string, Map<string, any>>(['artists', 'albums', 'tracks'].map(kind => [kind, new Map()]));
    const revision = vi.fn().mockResolvedValue({data: {revision: 3}, error: null});
    const ranges = vi.fn().mockResolvedValue({data: [], error: null});
    const update = vi.fn().mockResolvedValue({error: null});
    const queries: {table: string; selected?: string; filters: any[][]}[] = [];
    const rpc = vi.fn(async (name: string, params: any): Promise<any> => {
      if (name === 'ingest_spotify_catalog') {
        for (const item of params.p_items) catalogs.get(params.p_kind)!.set(item.id, item);
      }
      return {data: null, error: null};
    });
    const client = {
      auth: {getSession: vi.fn().mockResolvedValue({data: {session: {access_token: 'test-only'}}, error: null})},
      rpc,
      from: vi.fn((table: string) => {
        const query = {table, filters: [] as any[][], selected: undefined as string | undefined};
        queries.push(query);
        let mutation: unknown;
        const builder = {
          select: vi.fn((fields: string) => {query.selected = fields;return builder;}),
          eq: vi.fn((field: string, value: unknown) => {
            query.filters.push([field, value]);
            return mutation === undefined ? builder : update(mutation, query.filters);
          }),
          in: vi.fn(async (field: string, values: string[]) => {
            query.filters.push([field, values]);
            if (table === 'stats_snapshots') return ranges();
            return {data: values.map(id => catalogs.get(table)!.get(id)).filter(Boolean), error: null};
          }),
          maybeSingle: revision,
          update: vi.fn((value: unknown) => {mutation = value;return builder;})
        };
        return builder;
      })
    };
    return {service: new SupabaseService(async () => client as any), client, rpc, revision, ranges, update, queries, catalogs};
  }

  it('saves distinct ranked identities atomically after catalog dependencies, retaining historical dates', async () => {
    const {service, rpc, queries, update} = setup();
    const lead = {id: 'lead', name: 'Lead', images: [{url: 'https://images.example/lead'}]};
    const guest = {id: 'guest', name: 'Guest'};
    const album = {id: 'album', name: 'Album', release_date: '2025-07', artists: [guest], images: [{url: 'https://images.example/album'}]};
    const song = {id: 'song', name: 'Midnight Drive', artists: [lead], album, duration_ms: 210000, explicit: true};
    await service.saveStatsSnapshot('owner', 'short_term', 50, 3,
      [song, null, song, {...song, id: 'edition', name: ' MIDNIGHT DRIVE '}, {id: 'other', name: 'Other', artist_name: 'Guest'}],
      [lead, null, lead, guest],
      [{name: 'Rock', percentage: 24.4, count: 200}, {name: 'Rock', percentage: 90}, {name: 'Dream Pop', count: 18}, {name: 'Unknown'}, null],
      false, '2026-10-04');
    const calls = rpc.mock.calls;
    expect(calls.at(-1)).toEqual(['replace_stats_snapshot_v2', {
      p_user_id: 'owner', p_range: 'short_term', p_snapshot_date: '2026-10-04',
      p_explicit_percentage: 50, p_genre_diversity: 3,
      p_tracks: [{track_id: 'song', rank: 1}, {track_id: 'other', rank: 2}],
      p_artists: [{artist_id: 'lead', rank: 1}, {artist_id: 'guest', rank: 2}],
      p_genres: [{genre_name: 'Rock', rank: 1, weight: 24}, {genre_name: 'Dream Pop', rank: 2, weight: 18}, {genre_name: 'Unknown', rank: 3, weight: 0}],
      p_fetched_at: new Date('2026-10-04T01:00:00').toISOString(),
      p_idempotency_key: `owner:short_term:2026-10-04:${new Date('2026-10-04T01:00:00').toISOString()}`, p_expected_revision: 3
    }]);
    expect(calls.slice(0, -1).map(([, params]) => params.p_kind)).toEqual(['artists', 'albums', 'tracks']);
    expect(calls[0][1].p_items.map((item: any) => item.id)).toEqual(['lead', 'guest']);
    expect(calls[1][1].p_items[0]).toMatchObject({id: 'album', release_date: '2025-07-01', image_url: 'https://images.example/album'});
    expect(calls[2][1].p_items.map((item: any) => item.id)).toEqual(['song', 'edition', 'other']);
    expect(calls[2][1].p_relationships).toEqual([{track_id: 'song', artist_id: 'lead', artist_rank: 0}, {track_id: 'edition', artist_id: 'lead', artist_rank: 0}]);
    expect(queries.find(query => query.selected === 'revision')!.filters).toEqual([
      ['user_id', 'owner'], ['range', 'short_term'], ['snapshot_date', '2026-10-04']
    ]);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([[], ['short_term'], ['short_term', 'medium_term'], ['short_term', 'short_term', 'long_term']])(
    'does not advertise daily completion when required ranges are missing: %j', async (...completed: string[]) => {
      const {service, ranges, update} = setup();
      ranges.mockResolvedValue({data: completed.map(range => ({range})), error: null});
      await service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], []);
      expect(update).not.toHaveBeenCalled();
    });

  it('marks only the owner complete after all three current-day ranges exist', async () => {
    const {service, ranges, update, queries} = setup();
    ranges.mockResolvedValue({data: ['long_term', 'short_term', 'medium_term', 'short_term'].map(range => ({range})), error: null});
    await service.saveStatsSnapshot('owner', 'long_term', 0, 0, [], [], []);
    expect(queries.find(query => query.selected === 'range')!.filters).toEqual([
      ['user_id', 'owner'], ['snapshot_date', '2026-10-06'], ['range', ['short_term', 'medium_term', 'long_term']]
    ]);
    expect(update).toHaveBeenCalledExactlyOnceWith({last_synced_at: new Date().toISOString()}, [['id', 'owner']]);
  });

  it('propagates a revision-read failure without replacement or completion and allows retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, revision, rpc, update} = setup();
    const denied = {code: '42501', message: 'Denied'};
    revision.mockResolvedValueOnce({data: null, error: denied});
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).rejects.toBe(denied);
    expect(rpc).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    revision.mockResolvedValueOnce({data: null, error: null});
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).resolves.toBeUndefined();
    expect(rpc.mock.calls[0][1].p_expected_revision).toBe(0);
  });

  it('does not mark completion after an atomic replacement conflict and permits a fresh retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, rpc, revision, ranges, update} = setup();
    const conflict = {code: '40001', message: 'Concurrent replacement'};
    rpc.mockResolvedValueOnce({data: null, error: conflict});
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).rejects.toBe(conflict);
    expect(ranges).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    revision.mockResolvedValueOnce({data: {revision: 4}, error: null});
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).resolves.toBeUndefined();
    expect(rpc.mock.calls[1][1].p_expected_revision).toBe(4);
  });

  it.each(['artists', 'albums', 'tracks'])('recovers from a partial %s catalog failure without publishing incomplete rankings', async kind => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, rpc, revision, update} = setup();
    const ingest = rpc.getMockImplementation()!;
    const failure = {code: '503', message: 'Catalog unavailable'};
    let unavailable = true;
    rpc.mockImplementation(async (name, params) => {
      if (unavailable && name === 'ingest_spotify_catalog' && params.p_kind === kind) return {data: null, error: failure};
      return ingest(name, params);
    });
    const artist = {id: 'lead', name: 'Lead'};
    const album = {id: 'album', name: 'Album', artists: [artist]};
    const tracks = [{id: 'song', name: 'Song', artists: [artist], album}];
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 1, tracks, [artist], [{name: 'Rock', percentage: 24}])).rejects.toBe(failure);
    expect(rpc.mock.calls.some(([name]) => name === 'replace_stats_snapshot_v2')).toBe(false);
    expect(revision).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    unavailable = false;
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 1, tracks, [artist], [{name: 'Rock', percentage: 24}])).resolves.toBeUndefined();
    const replacements = rpc.mock.calls.filter(([name]) => name === 'replace_stats_snapshot_v2');
    expect(replacements).toHaveLength(1);
    expect(replacements[0][1]).toMatchObject({p_tracks: [{track_id: 'song', rank: 1}], p_artists: [{artist_id: 'lead', rank: 1}]});
  });

  it('historical backfill preserves existing catalog metadata while supplying ranked references', async () => {
    const {service, catalogs, rpc, revision, update} = setup();
    for (const [kind, id, name] of [['artists', 'lead', 'Canonical Artist'], ['albums', 'album', 'Canonical Album'], ['tracks', 'song', 'Canonical Song']]) {
      catalogs.get(kind)!.set(id, {id, name});
    }
    revision.mockResolvedValue({data: null, error: null});
    const artist = {id: 'lead', name: 'Older Artist'};
    const album = {id: 'album', name: 'Older Album', artists: [artist]};
    await service.saveStatsSnapshot('owner', 'short_term', 0, 0, [{id: 'song', name: 'Older Song', artists: [artist], album}], [artist], [], true, '2026-10-03');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('replace_stats_snapshot_v2');
    expect(rpc.mock.calls[0][1]).toMatchObject({p_snapshot_date: '2026-10-03', p_expected_revision: 0,
      p_tracks: [{track_id: 'song', rank: 1}], p_artists: [{artist_id: 'lead', rank: 1}]});
    expect([...catalogs.values()].map(catalog => [...catalog.values()][0].name)).toEqual(['Canonical Artist', 'Canonical Album', 'Canonical Song']);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports daily completion-read and marker-write failures and can recover after the snapshot committed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, ranges, update, rpc} = setup();
    const readFailure = {code: '503', message: 'Ranges unavailable'};
    ranges.mockResolvedValueOnce({data: null, error: readFailure});
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).rejects.toBe(readFailure);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    ranges.mockResolvedValue({data: ['short_term', 'medium_term', 'long_term'].map(range => ({range})), error: null});
    const markerFailure = {code: '42501', message: 'Marker denied'};
    update.mockResolvedValueOnce({error: markerFailure});
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).rejects.toBe(markerFailure);
    await expect(service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], [])).resolves.toBeUndefined();
    expect(update.mock.calls).toEqual([
      [{last_synced_at: new Date().toISOString()}, [['id', 'owner']]],
      [{last_synced_at: new Date().toISOString()}, [['id', 'owner']]]
    ]);
  });

  it('uses the prior daily snapshot until the local 01:00 cutoff', async () => {
    vi.setSystemTime(new Date('2026-10-06T00:59:59'));
    const {service, ranges, rpc, queries, update} = setup();
    ranges.mockResolvedValue({data: ['short_term', 'medium_term', 'long_term'].map(range => ({range})), error: null});
    await service.saveStatsSnapshot('owner', 'short_term', 0, 0, [], [], []);
    expect(rpc.mock.calls[0][1]).toMatchObject({p_snapshot_date: '2026-10-05', p_fetched_at: new Date('2026-10-05T01:00:00').toISOString()});
    expect(queries.find(query => query.selected === 'range')!.filters).toContainEqual(['snapshot_date', '2026-10-05']);
    expect(update).toHaveBeenCalledExactlyOnceWith({last_synced_at: new Date().toISOString()}, [['id', 'owner']]);
  });

  it('serializes same-owner/range/day writes while unrelated owners, ranges and days progress', async () => {
    const {service, rpc, revision} = setup();
    let markEntered!: () => void;
    let releaseWrite!: (value: any) => void;
    const entered = new Promise<void>(resolve => {markEntered = resolve;});
    const release = new Promise<any>(resolve => {releaseWrite = resolve;});
    rpc.mockImplementationOnce(async () => {markEntered();return release;});
    const first = service.saveStatsSnapshot('owner', 'short_term', 1, 0, [], [], [], false, '2026-10-04');
    await entered;
    const second = service.saveStatsSnapshot('owner', 'short_term', 2, 0, [], [], [], false, '2026-10-04');
    await service.saveStatsSnapshot('owner', 'long_term', 3, 0, [], [], [], false, '2026-10-04');
    await service.saveStatsSnapshot('other-owner', 'short_term', 4, 0, [], [], [], false, '2026-10-04');
    await service.saveStatsSnapshot('owner', 'short_term', 5, 0, [], [], [], false, '2026-10-05');
    const requests = () => rpc.mock.calls.map(([, params]) => [params.p_user_id, params.p_range, params.p_snapshot_date, params.p_explicit_percentage]);
    const independent = [['owner', 'short_term', '2026-10-04', 1], ['owner', 'long_term', '2026-10-04', 3],
      ['other-owner', 'short_term', '2026-10-04', 4], ['owner', 'short_term', '2026-10-05', 5]];
    expect(requests()).toEqual(independent);
    expect(revision).toHaveBeenCalledTimes(4);
    revision.mockResolvedValueOnce({data: {revision: 4}, error: null});
    releaseWrite({data: null, error: null});
    await Promise.all([first, second]);
    expect(requests()).toEqual([...independent, ['owner', 'short_term', '2026-10-04', 2]]);
    expect(rpc.mock.calls.at(-1)![1].p_expected_revision).toBe(4);
  });

  it('continues an already-queued snapshot write after its predecessor fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, rpc, revision} = setup();
    let markEntered!: () => void;
    let releaseWrite!: (value: any) => void;
    const entered = new Promise<void>(resolve => {markEntered = resolve;});
    const release = new Promise<any>(resolve => {releaseWrite = resolve;});
    rpc.mockImplementationOnce(async () => {markEntered();return release;});
    const conflict = {code: '40001', message: 'Concurrent replacement'};
    const first = service.saveStatsSnapshot('owner', 'short_term', 1, 0, [], [], [], false, '2026-10-04');
    const failed = expect(first).rejects.toBe(conflict);
    await entered;
    const second = service.saveStatsSnapshot('owner', 'short_term', 2, 0, [], [], [], false, '2026-10-04');
    expect(rpc).toHaveBeenCalledTimes(1);
    revision.mockResolvedValueOnce({data: {revision: 5}, error: null});
    releaseWrite({data: null, error: conflict});
    await failed;
    await expect(second).resolves.toBeUndefined();
    expect(rpc.mock.calls[1][1]).toMatchObject({p_user_id: 'owner', p_expected_revision: 5, p_explicit_percentage: 2});
  });
});
