import {describe, expect, it, vi} from 'vitest';
import {SupabaseService} from './supabase.service';

describe('historical Stats search service boundary', () => {
  function setup() {
    const rpc = vi.fn().mockResolvedValue({data: [], error: null});
    const factory = vi.fn(async () => ({rpc}) as any);
    return {service: new SupabaseService(factory), rpc, factory};
  }

  it('does not initialize a remote client for empty or one-character queries', async () => {
    const {service, factory} = setup();
    for (const query of ['', '   ', ' x ']) {
      await expect(service.searchPastTopItems('short_term', 'track', query)).resolves.toEqual([]);
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it('passes the selected period, category, trimmed query and result bound to the authenticated RPC', async () => {
    const {service, rpc} = setup();
    for (const kind of ['track', 'artist', 'genre'] as const) {
      await service.searchPastTopItems('long_term', kind, '  Dream Pop  ', 7);
    }
    expect(rpc.mock.calls).toEqual(['track', 'artist', 'genre'].map(kind => ['search_past_top_items', {
      p_range: 'long_term', p_kind: kind, p_query: 'Dream Pop', p_limit: 7
    }]));
  });

  it('returns historical identities, ranks and dates with optional display metadata defaults', async () => {
    const {service, rpc} = setup();
    rpc.mockResolvedValueOnce({error: null, data: [
      {kind: 'track', item_id: 'song', item_name: 'Midnight Drive', subtitle: 'Lead', image_url: 'https://images.example/song',
        spotify_url: 'https://open.spotify.com/track/song', best_rank: '2', first_seen: '2026-01-01', last_seen: '2026-10-05', appearances: '12'},
      {kind: 'genre', item_id: 'dream-pop', item_name: 'Dream Pop', best_rank: 4, first_seen: '2026-02-01', last_seen: '2026-10-04'}
    ]});
    await expect(service.searchPastTopItems('medium_term', 'track', 'drive')).resolves.toEqual([
      {kind: 'track', id: 'song', name: 'Midnight Drive', subtitle: 'Lead', imageUrl: 'https://images.example/song',
        spotifyUrl: 'https://open.spotify.com/track/song', bestRank: 2, firstSeen: '2026-01-01', lastSeen: '2026-10-05', appearances: 12},
      {kind: 'genre', id: 'dream-pop', name: 'Dream Pop', subtitle: '', imageUrl: '', spotifyUrl: '', bestRank: 4,
        firstSeen: '2026-02-01', lastSeen: '2026-10-04', appearances: 0}
    ]);
    expect(rpc).toHaveBeenCalledWith('search_past_top_items', {
      p_range: 'medium_term', p_kind: 'track', p_query: 'drive', p_limit: 20
    });
  });

  it('propagates permission and transient failures without caching them as an empty result', async () => {
    const {service, rpc} = setup();
    for (const error of [{code: '42501', message: 'Denied'}, {code: '503', message: 'Temporarily unavailable'}]) {
      rpc.mockResolvedValueOnce({data: [{item_id: 'must-not-leak'}], error});
      await expect(service.searchPastTopItems('short_term', 'artist', 'lead')).rejects.toBe(error);
    }
    rpc.mockResolvedValueOnce({data: null, error: null});
    await expect(service.searchPastTopItems('short_term', 'artist', 'lead')).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
