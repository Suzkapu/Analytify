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

  it('binds recipient synchronization to an opaque lease and exact revisions', async () => {
    rpc.and.callFake((name: string) => Promise.resolve({
      data: name === 'claim_playlist_share_sync' || name === 'complete_playlist_share_sync',
      error: null
    }));

    const lease = await service.claimDownloadSync('share-id', 7, 5);
    expect(lease).toMatch(/^[0-9a-f-]{36}$/);
    expect(rpc).toHaveBeenCalledWith('claim_playlist_share_sync', {
      p_share_id: 'share-id',
      p_recipient_user_id: null,
      p_expected_source_revision: 7,
      p_expected_applied_revision: 5,
      p_lease_token: lease
    });

    const completed = await service.completeDownloadSync(
      'share-id', 7, 5, lease!, 'spotify-id', 'https://open.spotify.com/playlist/spotify-id'
    );
    expect(completed).toBeTrue();
    expect(rpc).toHaveBeenCalledWith('complete_playlist_share_sync', jasmine.objectContaining({
      p_expected_source_revision: 7,
      p_expected_applied_revision: 5,
      p_lease_token: lease
    }));
  });

  it('sends the revision the owner viewed with an explicit snapshot refresh', async () => {
    rpc.and.resolveTo({data: 6, error: null});
    const publication = {
      sourcePlaylistId: 'source',
      playlistName: 'Fresh',
      playlistDescription: '',
      playlistImageUrl: '',
      tracks: [track('one', 1)]
    };

    expect(await service.refreshShare('share-id', 5, publication)).toBe(6);
    expect(rpc).toHaveBeenCalledWith('refresh_playlist_share', jasmine.objectContaining({
      p_share_id: 'share-id',
      p_expected_revision: 5
    }));
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
      Promise.resolve({data: rows.slice(start, end + 1), error: null, count: rows.length})
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

  it('emits parallel pages in stable playlist order', async () => {
    const rows = Array.from({length: 1_100}, (_, index) => ({position: index, track: track(`t-${index}`, index + 1)}));
    let active = 0;
    let maximumActive = 0;
    const range = jasmine.createSpy('range').and.callFake(async (start: number, end: number) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, start === 500 ? 5 : 0));
      active--;
      return {data: rows.slice(start, end + 1), error: null, count: rows.length};
    });
    const query: any = {select: () => query, eq: () => query, order: () => query, range};
    from.and.returnValue(query);
    const pages: string[][] = [];

    const result = await service.loadShareTracks('large-share', {
      pageSize: 500, concurrency: 3, onPage: page => pages.push(page.map(item => item.id))
    });

    expect(maximumActive).toBe(2);
    expect(pages[1][0]).toBe('t-500');
    expect(pages[2][0]).toBe('t-1000');
    expect(result.map(item => item.id)).toEqual(rows.map(row => row.track.id));
  });

  it('aborts remaining track-page work', async () => {
    const controller = new AbortController();
    const query: any = {
      select: () => query, eq: () => query, order: () => query,
      range: () => Promise.resolve({data: Array.from({length: 500}, (_, i) => ({position: i, track: track(`${i}`, i)})), error: null, count: 1_500})
    };
    from.and.returnValue(query);
    controller.abort();

    await expectAsync(service.loadShareTracks('share', {signal: controller.signal})).toBeRejectedWithError('Shared playlist loading was cancelled.');
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
