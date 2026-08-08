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
  let from: jasmine.Spy;
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
    from = jasmine.createSpy('from').and.returnValue(profileQuery);
    TestBed.configureTestingModule({
      providers: [
        PlaylistSharingService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              rpc,
              auth: {getUser: () => Promise.resolve({data: {user: {id: 'owner-id'}}, error: null})},
              from,
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

  it('loads every shared track beyond the Supabase one-thousand-row response limit', async () => {
    const rows = Array.from({length: 1_205}, (_, index) => ({
      position: index,
      track: track(`track-${index}`, index + 1)
    }));
    const range = jasmine.createSpy('range').and.callFake((start: number, end: number) =>
      Promise.resolve({data: rows.slice(start, end + 1), error: null})
    );
    const shareQuery: any = {
      select: () => shareQuery,
      eq: () => shareQuery,
      maybeSingle: () => Promise.resolve({
        data: {
          id: 'large-share', owner_user_id: 'owner-id', recipient_user_id: null,
          source_playlist_id: 'source', playlist_name: 'Huge playlist', playlist_description: '',
          playlist_image_url: '', owner_display_name: 'Owner', owner_image_url: '',
          recipient_display_name: null, track_count: rows.length, revision: 1,
          created_at: 'now', updated_at: 'now', accepted_at: null, revoked_at: null
        },
        error: null
      })
    };
    const tracksQuery: any = {
      select: () => tracksQuery,
      eq: () => tracksQuery,
      order: () => tracksQuery,
      range
    };
    const downloadQuery: any = {
      select: () => downloadQuery,
      eq: () => downloadQuery,
      maybeSingle: () => Promise.resolve({data: null, error: null})
    };
    from.and.callFake((table: string) => {
      if (table === 'playlist_shares') return shareQuery;
      if (table === 'playlist_share_tracks') return tracksQuery;
      if (table === 'playlist_share_downloads') return downloadQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const details = await service.loadShare('large-share');

    expect(details.tracks.length).toBe(1_205);
    expect(details.tracks[1_204].id).toBe('track-1204');
    expect(range.calls.allArgs()).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499]
    ]);
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
