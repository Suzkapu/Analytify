import {CompareGuestPlaylistSourceService} from './compare-guest-playlist-source.service';
import {ComparePlaylist, CompareTrack} from './compare-room.models';

describe('CompareGuestPlaylistSourceService', () => {
  let values: Record<string, string>;
  let storage: any;
  let supabase: any;
  let spotify: any;
  let service: CompareGuestPlaylistSourceService;

  beforeEach(() => {
    values = {};
    storage = {
      initFromDB: jasmine.createSpy('initFromDB').and.resolveTo(),
      getItem: jasmine.createSpy('getItem').and.callFake((key: string) => values[key] ?? null)
    };
    supabase = {
      client: {auth: {getSession: jasmine.createSpy('getSession').and.resolveTo({data: {session: null}})}},
      loadUserProfile: jasmine.createSpy('loadUserProfile').and.resolveTo(null),
      checkBackupActive: jasmine.createSpy('checkBackupActive').and.resolveTo(false),
      loadUserCache: jasmine.createSpy('loadUserCache').and.resolveTo([])
    };
    spotify = jasmine.createSpyObj('ParticipantSpotifyService', [
      'getPlaylists',
      'getPlaylistTracks',
      'normalizeCachedPlaylists',
      'normalizeCachedTracks'
    ]);
    spotify.normalizeCachedPlaylists.and.callFake((playlists: any[]) => playlists.map(item => ({
      id: item.id,
      name: item.name,
      imageUrl: '',
      total: item.total || 0,
      ownerName: ''
    })));
    spotify.normalizeCachedTracks.and.callFake((artists: any[]) =>
      artists.flatMap(artist => artist.tracks || []).map((track: any, index: number): CompareTrack => ({
        id: track.id,
        uri: `spotify:track:${track.id}`,
        name: track.name,
        artists: [{id: 'artist', name: 'Artist'}],
        albumName: '',
        imageUrl: '',
        spotifyUrl: '',
        playlistIndex: index + 1
      }))
    );
    service = new CompareGuestPlaylistSourceService(storage, supabase, spotify);
  });

  it('uses a fresh device cache only when it belongs to the QR-authorized account', async () => {
    values['spotifyUserId'] = 'guest-user';
    values['guest-user_playlists'] = JSON.stringify([{id: 'fav', name: 'Liked Songs', total: 2_000}]);
    values['guest-user_playlists_lastUpdated'] = Date.now().toString();

    const result = await service.loadPlaylists('guest-token', 'guest-user');

    expect(result.source).toBe('local');
    expect(result.playlists[0].total).toBe(2_000);
    expect(spotify.getPlaylists).not.toHaveBeenCalled();
    expect(supabase.loadUserCache).not.toHaveBeenCalled();
  });

  it('loads fresh playlist tracks from the matching guest Supabase session', async () => {
    supabase.client.auth.getSession.and.resolveTo({
      data: {session: {user: {id: 'supabase-guest', user_metadata: {provider_id: 'guest-user'}}}}
    });
    supabase.loadUserProfile.and.resolveTo({spotify_id: 'guest-user'});
    supabase.checkBackupActive.and.resolveTo(true);
    supabase.loadUserCache.and.callFake(async (_: string, keys: string[]) => {
      const rows: Array<{key: string; value: string}> = [];
      if (keys.includes('guest-user_party')) {
        rows.push(
          {key: 'guest-user_party', value: JSON.stringify([{tracks: [{id: 'shared', name: 'Shared'}]}])},
          {key: 'guest-user_party_CachedTrackCount', value: '1'},
          {key: 'guest-user_party_lastUpdated', value: Date.now().toString()}
        );
      }
      return rows;
    });
    const playlist: ComparePlaylist = {
      id: 'party',
      name: 'Party',
      imageUrl: '',
      total: 1,
      ownerName: 'Guest'
    };

    const result = await service.loadTracks(playlist, 'guest-token', 'guest-user');

    expect(result.source).toBe('cloud');
    expect(result.tracks.map(track => track.id)).toEqual(['shared']);
    expect(supabase.loadUserCache).toHaveBeenCalledWith('supabase-guest', [
      'guest-user_party',
      'guest-user_party_CachedTrackCount',
      'guest-user_party_lastUpdated'
    ]);
    expect(spotify.getPlaylistTracks).not.toHaveBeenCalled();
  });

  it('does not read another Analytify account cache on the guest device', async () => {
    values['spotifyUserId'] = 'different-user';
    supabase.client.auth.getSession.and.resolveTo({
      data: {session: {user: {id: 'different-supabase-user', user_metadata: {provider_id: 'different-user'}}}}
    });
    supabase.loadUserProfile.and.resolveTo({spotify_id: 'different-user'});
    spotify.getPlaylists.and.resolveTo([{
      id: 'spotify-list',
      name: 'Spotify list',
      imageUrl: '',
      total: 10,
      ownerName: 'Guest'
    }]);

    const result = await service.loadPlaylists('guest-token', 'qr-guest');

    expect(result.source).toBe('spotify');
    expect(spotify.getPlaylists).toHaveBeenCalledWith('guest-token', 'qr-guest');
    expect(supabase.checkBackupActive).not.toHaveBeenCalled();
    expect(supabase.loadUserCache).not.toHaveBeenCalled();
  });
});
