import {TestBed} from '@angular/core/testing';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PlaylistSharingService} from './playlist-sharing.service';

describe('PlaylistSharingService', () => {
  let service: PlaylistSharingService;
  let rpc: jasmine.Spy;
  let channel: any;
  let channelFactory: jasmine.Spy;
  let channelOn: jasmine.Spy;
  let channelSubscribe: jasmine.Spy;
  let removeChannel: jasmine.Spy;
  let postgresChangeHandler: (() => void) | null;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo({data: 'share-id', error: null});
    postgresChangeHandler = null;
    channel = {};
    channelOn = jasmine.createSpy('on').and.callFake(
      (_type: string, _filter: any, handler: () => void) => {
        postgresChangeHandler = handler;
        return channel;
      }
    );
    channelSubscribe = jasmine.createSpy('subscribe').and.returnValue(channel);
    channel.on = channelOn;
    channel.subscribe = channelSubscribe;
    channelFactory = jasmine.createSpy('channel').and.returnValue(channel);
    removeChannel = jasmine.createSpy('removeChannel').and.resolveTo('ok');
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
              from: () => profileQuery,
              channel: channelFactory,
              removeChannel
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

  it('subscribes to a single share and removes the realtime channel during cleanup', () => {
    const onChange = jasmine.createSpy('onChange');

    const unsubscribe = service.subscribeToShareChanges(onChange, 'share-id');

    expect(channelFactory).toHaveBeenCalled();
    expect(channelOn).toHaveBeenCalledWith(
      'postgres_changes',
      jasmine.objectContaining({
        event: '*',
        schema: 'public',
        table: 'playlist_shares',
        filter: 'id=eq.share-id'
      }),
      jasmine.any(Function)
    );
    expect(channelSubscribe).toHaveBeenCalledTimes(1);

    postgresChangeHandler?.();
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeChannel).toHaveBeenCalledOnceWith(channel);
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
