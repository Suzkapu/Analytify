import {describe, expect, it} from 'vitest';
import {designVariantFromUrl, LogicalRouteId, resolveDesignRoute} from './design-navigation';

describe('design route resolution', () => {
  const routes: Array<[LogicalRouteId, Record<string, string>, string[], string[]]> = [
    ['login', {}, ['/login'], ['/new', 'login']],
    ['callback', {}, ['/callback'], ['/new', 'callback']],
    ['playlists', {}, ['/playlists'], ['/new', 'playlists']],
    ['songs', {id: 'playlist-1'}, ['/songs', 'playlist-1'], ['/new', 'songs', 'playlist-1']],
    ['artistDetails', {id: 'artist-1'}, ['/artistDetails', 'artist-1'], ['/new', 'artistDetails', 'artist-1']],
    ['analysis', {id: 'playlist-1'}, ['/analysis', 'playlist-1'], ['/new', 'analysis', 'playlist-1']],
    ['stats', {userId: 'user-1'}, ['/stats', 'user-1'], ['/new', 'stats', 'user-1']],
    ['history', {}, ['/history'], ['/new', 'history']],
    ['admin', {}, ['/admin'], ['/new', 'admin']],
    ['songLeague', {leagueId: 'league-1'}, ['/song-league', 'league-1'], ['/new', 'song-league', 'league-1']],
    ['songLeagueJoin', {token: 'durable-token'}, ['/song-league', 'join', 'durable-token'], ['/new', 'song-league', 'join', 'durable-token']],
    ['sharedPlaylists', {id: 'share-1'}, ['/shared-playlists', 'share-1'], ['/new', 'shared-playlists', 'share-1']],
    ['sharedPlaylistClaim', {token: 'durable-token'}, ['/shared-playlists', 'claim', 'durable-token'], ['/new', 'shared-playlists', 'claim', 'durable-token']],
    ['statsRequestClaim', {token: 'durable-token'}, ['/shared-playlists', 'stats-request', 'durable-token'], ['/new', 'shared-playlists', 'stats-request', 'durable-token']],
    ['statsShareClaim', {token: 'durable-token'}, ['/shared-playlists', 'stats-share', 'durable-token'], ['/new', 'shared-playlists', 'stats-share', 'durable-token']],
    ['compareRoom', {}, ['/compare-room'], ['/new', 'compare-room']],
    ['compareRoomJoin', {roomId: 'room-1'}, ['/compare-room', 'join', 'room-1'], ['/new', 'compare-room', 'join', 'room-1']],
    ['compareRoomCallback', {}, ['/compare-room', 'callback'], ['/new', 'compare-room', 'callback']],
    ['legal', {}, ['/legal'], ['/new', 'legal']],
    ['spotifyConnect', {}, ['/spotify', 'connect'], ['/new', 'spotify', 'connect']],
    ['spotifyCallback', {}, ['/spotify', 'callback'], ['/new', 'spotify', 'callback']],
    ['spotifyCloudAccess', {}, ['/spotify', 'cloud-access'], ['/new', 'spotify', 'cloud-access']]
  ];

  it.each(routes)('resolves %s for both design variants', (route, parameters, legacy, modern) => {
    expect(resolveDesignRoute('legacy', route, parameters)).toEqual(legacy);
    expect(resolveDesignRoute('new', route, parameters)).toEqual(modern);
  });

  it('omits optional route parameters without changing the namespace', () => {
    expect(resolveDesignRoute('legacy', 'stats')).toEqual(['/stats']);
    expect(resolveDesignRoute('new', 'songLeague')).toEqual(['/new', 'song-league']);
  });

  it('rejects a missing required route parameter', () => {
    expect(() => resolveDesignRoute('new', 'songs')).toThrowError('Missing route parameter: id');
  });

  it('rejects an unknown runtime route ID instead of falling back to legacy navigation', () => {
    expect(() => resolveDesignRoute('new', 'missing' as LogicalRouteId)).toThrow();
  });

  it('keeps durable identifiers unchanged between route namespaces', () => {
    const legacy = resolveDesignRoute('legacy', 'songLeagueJoin', {token: 'same-token'});
    const modern = resolveDesignRoute('new', 'songLeagueJoin', {token: 'same-token'});
    expect(legacy.at(-1)).toBe('same-token');
    expect(modern.at(-1)).toBe('same-token');
  });

  it('detects only the routing-layer v2 namespace', () => {
    expect(designVariantFromUrl('/new/stats?range=short_term')).toBe('new');
    expect(designVariantFromUrl('/newness')).toBe('legacy');
    expect(designVariantFromUrl('/stats')).toBe('legacy');
  });
});
