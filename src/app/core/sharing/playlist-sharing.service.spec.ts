import {TestBed} from '@angular/core/testing';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PlaylistSharingService} from './playlist-sharing.service';

describe('PlaylistSharingService', () => {
  let service: PlaylistSharingService;
  let rpc: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo({data: 'share-id', error: null});
    const profileQuery: any = {
      select: () => profileQuery,
      eq: () => profileQuery,
      maybeSingle: () => Promise.resolve({
        data: {display_name: 'Owner', profile_pic_url: 'owner.jpg'},
        error: null
      })
    };
    TestBed.configureTestingModule({
      providers: [
        PlaylistSharingService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              rpc,
              auth: {getUser: () => Promise.resolve({data: {user: {id: 'owner-id'}}, error: null})},
              from: () => profileQuery
            }
          }
        }
      ]
    });
    service = TestBed.inject(PlaylistSharingService);
  });

  it('creates a high-entropy claim link while sending the raw token only to the hashing RPC', async () => {
    const created = await service.createShare({
      sourcePlaylistId: 'party',
      playlistName: 'Party',
      playlistDescription: '',
      playlistImageUrl: '',
      tracks: [track('one', 1)]
    });

    const rpcArguments = rpc.calls.mostRecent().args[1];
    expect(rpc.calls.mostRecent().args[0]).toBe('create_playlist_share');
    expect(rpcArguments.p_claim_token.length).toBe(64);
    expect(created.shareId).toBe('share-id');
    expect(created.claimUrl).toContain(`/shared-playlists/claim/${rpcArguments.p_claim_token}`);
  });

  it('deduplicates cached tracks and derives playlist statistics without Spotify calls', () => {
    const tracks = service.normalizeCachedTracks([
      {tracks: [{...cachedTrack('shared', 2), artists: [{id: 'a', name: 'A'}, {id: 'b', name: 'B'}]}]},
      {tracks: [cachedTrack('shared', 2), cachedTrack('first', 1)]}
    ]);
    const stats = service.calculateStats(tracks);

    expect(tracks.map(item => item.id)).toEqual(['first', 'shared']);
    expect(stats.tracks).toBe(2);
    expect(stats.artists).toBe(2);
    expect(stats.albums).toBe(1);
    expect(stats.durationMs).toBe(360000);
  });

  function cachedTrack(id: string, playlistIndex: number) {
    return {
      id,
      name: id,
      artists: [{id: 'a', name: 'A'}],
      playlist_index: playlistIndex,
      duration_ms: 180000,
      album: {name: 'Album'}
    };
  }

  function track(id: string, playlistIndex: number) {
    return {
      id,
      uri: `spotify:track:${id}`,
      name: id,
      artists: [{id: 'artist', name: 'Artist'}],
      albumName: '',
      imageUrl: '',
      spotifyUrl: '',
      playlistIndex
    };
  }
});
