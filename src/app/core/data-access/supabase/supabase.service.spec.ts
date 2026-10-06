import {describe, expect, it, vi} from 'vitest';
import {loadSupabaseClient, SupabaseService} from './supabase.service';

describe('SupabaseService client readiness boundary', () => {
  it('returns the same configured client without changing session persistence or OAuth exchange settings', async () => {
    const client = {auth: {}} as any;
    const createClient = vi.fn().mockReturnValue(client);
    const service = new SupabaseService(() => loadSupabaseClient(async () => ({createClient}) as any));
    expect(createClient).not.toHaveBeenCalled();
    expect(await service.getClient()).toBe(client);
    expect(await service.getClient()).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      auth: {flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true}
    });
  });

  it('waits for readiness before reading the collaboration session', async () => {
    const client = {
      auth: {getSession: vi.fn().mockResolvedValue({data: {session: {access_token: 'token', user: {id: 'user'}}}, error: null})},
      realtime: {setAuth: vi.fn().mockResolvedValue(undefined)}
    } as any;
    const service = new SupabaseService(async () => client);
    let resolveClient!: (value: any) => void;
    vi.spyOn(service, 'getClient').mockReturnValue(new Promise(resolve => { resolveClient = resolve; }));
    const session = service.ensureCollaborationSession();
    expect(client.auth.getSession).not.toHaveBeenCalled();
    resolveClient(client);
    await expect(session).resolves.toBe('user');
    expect(client.realtime.setAuth).toHaveBeenCalledWith('token');
  });

  it('does not delete cached entries if initialization fails', async () => {
    const client = {from: vi.fn()} as any;
    const service = new SupabaseService(async () => client);
    vi.spyOn(service, 'getClient').mockRejectedValue(new Error('Client unavailable'));
    await expect(service.deleteUserCacheEntries('user', ['cache-key'])).rejects.toThrow('Client unavailable');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('coalesces concurrent initialization and retains the successful client', async () => {
    let resolveClient!: (value: any) => void;
    const factory = vi.fn(() => new Promise<any>(resolve => { resolveClient = resolve; }));
    const service = new SupabaseService(factory);
    expect(factory).not.toHaveBeenCalled();
    const first = service.getClient();
    expect(service.getClient()).toBe(first);
    await Promise.resolve();
    expect(factory).toHaveBeenCalledTimes(1);
    const client = {};
    resolveClient(client);
    await expect(first).resolves.toBe(client);
    expect(service.getClient()).toBe(first);
  });

  it('retries initialization after a shared failed request', async () => {
    const client = {} as any;
    const factory = vi.fn().mockRejectedValueOnce(new Error('SDK unavailable')).mockResolvedValue(client);
    const service = new SupabaseService(factory);
    const failed = service.getClient();
    expect(service.getClient()).toBe(failed);
    await expect(failed).rejects.toThrow('SDK unavailable');
    await expect(service.getClient()).resolves.toBe(client);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('turns synchronous factory failure into a retryable rejected promise', async () => {
    const factory = vi.fn().mockImplementationOnce(() => { throw new Error('Initialization failed'); });
    factory.mockResolvedValue({});
    const service = new SupabaseService(factory);
    await expect(service.getClient()).rejects.toThrow('Initialization failed');
    await expect(service.getClient()).resolves.toEqual({});
  });
});

describe('SupabaseService saved rank history boundary', () => {
  function historyClient(response: {data: any; error: any}) {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve)
    };
    const client = {from: vi.fn().mockReturnValue(query)};
    const service = new SupabaseService(async () => client as any);
    return {service, client, query};
  }

  it.each([
    ['tracks', 'stats_snapshot_tracks', 'track_id'],
    ['artists', 'stats_snapshot_artists', 'artist_id'],
    ['genres', 'stats_snapshot_genres', 'genre_name']
  ] as const)('scopes %s history to the authenticated owner, period and item', async (category, table, identity) => {
    const {service, client, query} = historyClient({data: [], error: null});
    await expect(service.loadStatsItemTrend('owner-123', 'medium_term', category, ['item-123'])).resolves.toEqual([]);
    expect(client.from).toHaveBeenCalledWith(table);
    expect(query.select).toHaveBeenCalledWith('rank, stats_snapshots!inner(user_id, range, snapshot_date, created_at)');
    expect(query.eq.mock.calls).toEqual([
      ['stats_snapshots.user_id', 'owner-123'], ['stats_snapshots.range', 'medium_term'], [identity, 'item-123']
    ]);
    expect(query.in).not.toHaveBeenCalled();
  });

  it('does not initialize a client or issue an unrestricted query for absent identities', async () => {
    const factory = vi.fn();
    const service = new SupabaseService(factory);
    await expect(service.loadStatsItemTrend('owner', 'short_term', 'tracks', ['', ''])).resolves.toEqual([]);
    expect(factory).not.toHaveBeenCalled();
  });

  it('deduplicates linked track identities and keeps the best position on each saved day', async () => {
    const {service, query} = historyClient({data: [
      {rank: 9, stats_snapshots: {snapshot_date: '2026-09-18', created_at: '2026-09-19T03:00:00Z'}},
      {rank: '4', stats_snapshots: [{snapshot_date: '2026-09-05'}]},
      {rank: 3, stats_snapshots: {snapshot_date: '2026-09-18'}},
      {rank: 12, stats_snapshots: {snapshot_date: '2026-09-18'}},
      {rank: 1, stats_snapshots: null}, {rank: 2, stats_snapshots: []}
    ], error: null});
    const points = await service.loadStatsItemTrend('owner', 'long_term', 'tracks', ['original', '', 'linked', 'original']);
    expect(query.in).toHaveBeenCalledWith('track_id', ['original', 'linked']);
    expect(points).toEqual([
      {timestamp: new Date(2026, 8, 5).getTime(), snapshotDate: '2026-09-05', rank: 4},
      {timestamp: new Date(2026, 8, 18).getTime(), snapshotDate: '2026-09-18', rank: 3}
    ]);
  });

  it('treats a successful null response as empty history', async () => {
    const {service} = historyClient({data: null, error: null});
    await expect(service.loadStatsItemTrend('owner', 'short_term', 'artists', ['artist'])).resolves.toEqual([]);
  });

  it('retains the legacy empty fallback when the service rejects a query', async () => {
    const {service} = historyClient({data: [{rank: 3, stats_snapshots: {snapshot_date: '2026-09-18'}}], error: {code: '42501'}});
    await expect(service.loadStatsItemTrend('owner', 'short_term', 'tracks', ['track'])).resolves.toEqual([]);
  });

  it('recovers from client initialization failure on a later request', async () => {
    const {client} = historyClient({data: [], error: null});
    const factory = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(client);
    const service = new SupabaseService(factory);
    await expect(service.loadStatsItemTrend('owner', 'short_term', 'genres', ['Pop'])).resolves.toEqual([]);
    await expect(service.loadStatsItemTrend('owner', 'short_term', 'genres', ['Pop'])).resolves.toEqual([]);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it('distinguishes successful empty history from a permission failure without returning failed data', async () => {
    const empty = historyClient({data: [], error: null}).service;
    const failed = historyClient({data: [{rank: 3, stats_snapshots: {snapshot_date: '2026-09-18'}}], error: {code: '42501'}}).service;
    await expect(empty.loadStatsItemTrendResult('owner', 'short_term', 'tracks', ['track']))
      .resolves.toEqual({status: 'ready', points: []});
    await expect(failed.loadStatsItemTrendResult('owner', 'short_term', 'tracks', ['track']))
      .resolves.toEqual({status: 'unavailable', points: []});
  });

  it.each([NaN, Infinity, -1, 0, 1.5, null, true, '', 'invalid', '3.5'])('rejects damaged rank %s rather than hiding a same-day valid position', async rank => {
    const {service} = historyClient({data: [
      {rank, stats_snapshots: {snapshot_date: '2026-09-18'}},
      {rank: 3, stats_snapshots: {snapshot_date: '2026-09-18'}}
    ], error: null});
    await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'tracks', ['track']))
      .resolves.toEqual({status: 'unavailable', points: []});
    await expect(service.loadStatsItemTrend('owner', 'short_term', 'tracks', ['track'])).resolves.toEqual([]);
  });

  it.each(['2026-02-29', '2026-04-31', '2026-00-18', '2026-13-18', '2026-09-00', '2026-9-18', 'invalid', 123])('rejects impossible or malformed saved date %s without substituting created_at', async snapshotDate => {
      const {service} = historyClient({data: [{rank: 3, stats_snapshots: {snapshot_date: snapshotDate, created_at: '2026-09-18T12:00:00Z'}}], error: null});
      await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'tracks', ['track']))
        .resolves.toEqual({status: 'unavailable', points: []});
    });

  it('retains leap days and category-independent positive integer ranks from numeric serializers', async () => {
    const {service} = historyClient({data: [
      {rank:'100', stats_snapshots:{snapshot_date:'2024-02-29'}},
      {rank:1, stats_snapshots:{snapshot_date:'2024-03-01'}}
    ], error:null});
    await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'tracks', ['track'])).resolves.toEqual({status:'ready',points:[
      {timestamp:new Date(2024,1,29).getTime(),snapshotDate:'2024-02-29',rank:100},
      {timestamp:new Date(2024,2,1).getTime(),snapshotDate:'2024-03-01',rank:1}
    ]});
  });

  it('returns dated positions through the explicit result contract', async () => {
    const {service} = historyClient({data: [{rank: '3', stats_snapshots: {snapshot_date: '2026-09-18'}}], error: null});
    await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'artists', ['artist'])).resolves.toEqual({
      status: 'ready', points: [{timestamp: new Date(2026, 8, 18).getTime(), snapshotDate: '2026-09-18', rank: 3}]
    });
  });

  it('reports unavailable initialization and permits the next explicit request to recover', async () => {
    const {client} = historyClient({data: [], error: null});
    const service = new SupabaseService(vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(client));
    await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'genres', ['Pop']))
      .resolves.toEqual({status: 'unavailable', points: []});
    await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'genres', ['Pop']))
      .resolves.toEqual({status: 'ready', points: []});
  });

  it('returns ready empty without initializing the client for missing result identities', async () => {
    const factory = vi.fn();
    const service = new SupabaseService(factory);
    await expect(service.loadStatsItemTrendResult('owner', 'short_term', 'tracks', []))
      .resolves.toEqual({status: 'ready', points: []});
    expect(factory).not.toHaveBeenCalled();
  });
});
