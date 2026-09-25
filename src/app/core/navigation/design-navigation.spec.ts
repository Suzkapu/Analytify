import {describe, expect, it} from 'vitest';
import {designVariantFromUrl, LogicalRouteId, resolveDesignRoute} from './design-navigation';

describe('design route resolution', () => {
  const routes: Array<[LogicalRouteId, Record<string, string>, string[], string[]]> = [
    ['login', {}, ['/login'], ['/new', 'login']],
    ['playlists', {}, ['/playlists'], ['/new', 'playlists']],
    ['songs', {id: 'playlist-1'}, ['/songs', 'playlist-1'], ['/new', 'songs', 'playlist-1']],
    ['artistDetails', {id: 'artist-1'}, ['/artistDetails', 'artist-1'], ['/new', 'artistDetails', 'artist-1']],
    ['analysis', {id: 'playlist-1'}, ['/analysis', 'playlist-1'], ['/new', 'analysis', 'playlist-1']],
    ['stats', {userId: 'user-1'}, ['/stats', 'user-1'], ['/new', 'stats', 'user-1']],
    ['history', {}, ['/history'], ['/new', 'history']],
    ['admin', {}, ['/admin'], ['/new', 'admin']],
    ['songLeague', {leagueId: 'league-1'}, ['/song-league', 'league-1'], ['/new', 'song-league', 'league-1']],
    ['songLeagueJoin', {token: 'durable-token'}, ['/song-league', 'join', 'durable-token'], ['/new', 'song-league', 'join', 'durable-token']],
    ['sharedPlaylistClaim', {token: 'durable-token'}, ['/shared-playlists', 'claim', 'durable-token'], ['/new', 'shared-playlists', 'claim', 'durable-token']],
    ['compareRoomJoin', {roomId: 'room-1'}, ['/compare-room', 'join', 'room-1'], ['/new', 'compare-room', 'join', 'room-1']],
    ['legal', {}, ['/legal'], ['/new', 'legal']],
    ['spotifyConnect', {}, ['/spotify', 'connect'], ['/new', 'spotify', 'connect']]
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

  it('detects only the routing-layer v2 namespace', () => {
    expect(designVariantFromUrl('/new/stats?range=short_term')).toBe('new');
    expect(designVariantFromUrl('/newness')).toBe('legacy');
    expect(designVariantFromUrl('/stats')).toBe('legacy');
  });
});
