import {afterEach, describe, expect, it, vi} from 'vitest';
import {SupabaseService} from './supabase.service';

function setup(data: unknown = [], error: unknown = null) {
  const query = {select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({data, error})};
  const client = {from: vi.fn().mockReturnValue(query)};
  const factory = vi.fn(async () => client as never);
  return {service: new SupabaseService(factory), client, query, factory};
}
afterEach(() => vi.restoreAllMocks());

describe('saved Stats date metadata service boundary', () => {
  it('requests only lightweight metadata for the specified owner/range and retains stable detail identities', async () => {
    const {service, client, query} = setup([{id: 'snapshot-A', snapshot_date: '2024-02-29',
      created_at: '2024-02-29T22:00:00Z', explicit_percentage: '18', genre_diversity: 7}]);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'long_term')).resolves.toEqual([{
      id: 'snapshot-A', userId: 'owner-A', range: 'long_term', timestamp: new Date(2024, 1, 29).getTime(),
      snapshotDate: '2024-02-29', explicitPercentage: 18, genreDiversity: 7,
      topTracks: [], topArtists: [], topGenres: [], isLoaded: false
    }]);
    expect(client.from).toHaveBeenCalledExactlyOnceWith('stats_snapshots');
    expect(query.select).toHaveBeenCalledExactlyOnceWith('id, explicit_percentage, genre_diversity, created_at, snapshot_date');
    expect(query.eq.mock.calls).toEqual([['user_id', 'owner-A'], ['range', 'long_term']]);
    expect(query.order).toHaveBeenCalledExactlyOnceWith('snapshot_date', {ascending: true});
  });

  it.each([[], null])('distinguishes a successful empty metadata response %j from a failed read', async data => {
    const {service} = setup(data);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).resolves.toEqual([]);
  });

  it.each([{code: '42501', message: 'Denied'}, {code: '503', message: 'Unavailable'}])(
    'rejects %j rather than reporting an empty cloud inventory or exposing accompanying data', async error => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const {service, query} = setup([{id: 'must-not-leak', snapshot_date: '2026-10-04'}], error);
      await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).rejects.toBe(error);
      query.order.mockResolvedValueOnce({data: [], error: null});
      await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).resolves.toEqual([]);
      expect(query.order).toHaveBeenCalledTimes(2);
    });

  it('propagates a transport rejection and allows a fresh request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, query} = setup();
    const error = new Error('Isolated transport failure');
    query.order.mockRejectedValueOnce(error);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'medium_term')).rejects.toBe(error);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'medium_term')).resolves.toEqual([]);
  });

  it('allows client initialization to recover without caching failure as empty history', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service, factory} = setup();
    const error = new Error('Isolated initialization failure');
    factory.mockRejectedValueOnce(error);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).rejects.toBe(error);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).resolves.toEqual([]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-2-03', 'not-a-date'])('rejects malformed calendar metadata %s instead of rolling it to another date', async snapshot_date => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service} = setup([{id: 'snapshot-A', snapshot_date, created_at: '2026-10-04T12:00:00Z'}]);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).rejects.toThrow('Invalid saved snapshot date.');
  });

  it('keeps the legacy created-at fallback when the snapshot date is absent', async () => {
    const {service} = setup([{id: 'legacy', created_at: '2026-10-04T12:00:00Z'}]);
    const result = await service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({id: 'legacy', timestamp: Date.parse('2026-10-04T12:00:00Z'), isLoaded: false});
  });

  it('rejects metadata with no usable date instead of persisting NaN timestamps', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service} = setup([{id: 'invalid', created_at: 'bad'}]);
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).rejects.toThrow('Invalid saved snapshot date.');
  });

  it('rejects a malformed non-array response instead of presenting empty history', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {service} = setup({id: 'unexpected-object'});
    await expect(service.loadAllStatsSnapshotsMetadata('owner-A', 'short_term')).rejects.toThrow();
  });
});
