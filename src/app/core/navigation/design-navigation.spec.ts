import {describe, expect, it} from 'vitest';
import {LogicalRouteId, resolveDesignRoute} from './design-navigation';

describe('design route resolution', () => {
  const routes: Array<[LogicalRouteId, Record<string, string>, string[]]> = [
    ['login', {}, ['/login']],
    ['callback', {}, ['/callback']],
    ['playlists', {}, ['/playlists']],
    ['songs', {id: 'playlist-1'}, ['/songs', 'playlist-1']],
    ['artistDetails', {id: 'artist-1'}, ['/artistDetails', 'artist-1']],
    ['analysis', {id: 'playlist-1'}, ['/analysis', 'playlist-1']],
    ['stats', {userId: 'user-1'}, ['/stats', 'user-1']],
    ['history', {}, ['/history']],
    ['admin', {}, ['/admin']],
    ['songLeague', {leagueId: 'league-1'}, ['/song-league', 'league-1']],
    ['songLeagueJoin', {token: 'durable-token'}, ['/song-league', 'join', 'durable-token']],
    ['sharedPlaylists', {id: 'share-1'}, ['/shared-playlists', 'share-1']],
    ['sharedPlaylistClaim', {token: 'durable-token'}, ['/shared-playlists', 'claim', 'durable-token']],
    ['statsRequestClaim', {token: 'durable-token'}, ['/shared-playlists', 'stats-request', 'durable-token']],
    ['statsShareClaim', {token: 'durable-token'}, ['/shared-playlists', 'stats-share', 'durable-token']],
    ['compareRoom', {}, ['/compare-room']],
    ['compareRoomJoin', {roomId: 'room-1'}, ['/compare-room', 'join', 'room-1']],
    ['compareRoomCallback', {}, ['/compare-room', 'callback']],
    ['legal', {}, ['/legal']],
    ['spotifyConnect', {}, ['/spotify', 'connect']],
    ['spotifyCallback', {}, ['/spotify', 'callback']],
    ['spotifyCloudAccess', {}, ['/spotify', 'cloud-access']]
  ];

  it.each(routes)('resolves %s to its canonical route', (route, parameters, expected) => {
    expect(resolveDesignRoute(route, parameters)).toEqual(expected);
  });

  it('omits optional route parameters', () => {
    expect(resolveDesignRoute('stats')).toEqual(['/stats']);
    expect(resolveDesignRoute('songLeague')).toEqual(['/song-league']);
  });

  it('rejects missing required route parameters and unknown route IDs', () => {
    expect(() => resolveDesignRoute('songs')).toThrowError('Missing route parameter: id');
    expect(() => resolveDesignRoute('missing' as LogicalRouteId)).toThrow();
  });

  it('preserves durable external identifiers', () => {
    expect(resolveDesignRoute('songLeagueJoin', {token: 'same-token'}).at(-1)).toBe('same-token');
  });
});
