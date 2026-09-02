import {TestBed} from '@angular/core/testing';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from './stats-sharing.service';

describe('StatsSharingService', () => {
  let service: StatsSharingService;
  let rpc: jasmine.Spy;
  let channel: any;
  let changeHandler: (() => void) | null;
  let removeChannel: jasmine.Spy;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc');
    changeHandler = null;
    channel = {
      on: jasmine.createSpy('on').and.callFake((_event: string, _filter: any, handler: () => void) => {
        changeHandler = handler;
        return channel;
      }),
      subscribe: jasmine.createSpy('subscribe').and.returnValue(null)
    };
    channel.subscribe.and.returnValue(channel);
    removeChannel = jasmine.createSpy('removeChannel').and.resolveTo('ok');

    TestBed.configureTestingModule({
      providers: [
        StatsSharingService,
        {
          provide: SupabaseService,
          useValue: {client: {rpc, channel: () => channel, removeChannel}}
        }
      ]
    });
    service = TestBed.inject(StatsSharingService);
  });

  it('lists registered users with their per-viewer request state', async () => {
    rpc.and.resolveTo({data: [{
      user_id: 'owner-id', display_name: 'Owner', image_url: 'owner.jpg',
      request_id: 'request-id', request_status: 'approved'
    }], error: null});

    const users = await service.listAvailableUsers();

    expect(rpc).toHaveBeenCalledOnceWith('list_stats_shareable_users');
    expect(users).toEqual([{
      userId: 'owner-id', displayName: 'Owner', imageUrl: 'owner.jpg',
      requestId: 'request-id', requestStatus: 'approved'
    }]);
  });

  it('requests, approves, declines, and revokes access only through guarded RPCs', async () => {
    rpc.and.resolveTo({data: 'request-id', error: null});

    await expectAsync(service.requestAccess('owner-id')).toBeResolvedTo('request-id');
    await service.respondToRequest('request-id', true);
    await service.respondToRequest('request-id', false);
    await service.revokeAccess('request-id');

    expect(rpc.calls.allArgs()).toEqual([
      ['request_stats_access', {p_owner_user_id: 'owner-id'}],
      ['respond_stats_access', {p_request_id: 'request-id', p_approve: true}],
      ['respond_stats_access', {p_request_id: 'request-id', p_approve: false}],
      ['revoke_stats_access', {p_request_id: 'request-id'}]
    ]);
  });

  it('maps access records with the role returned for the current user', async () => {
    rpc.and.resolveTo({data: [{
      id: 'request-id', owner_user_id: 'owner-id', viewer_user_id: 'viewer-id',
      owner_display_name: 'Owner', owner_image_url: '', viewer_display_name: 'Viewer', viewer_image_url: '',
      status: 'pending', requested_at: '2026-09-01T10:00:00Z', responded_at: null,
      revoked_at: null, updated_at: '2026-09-01T10:00:00Z', viewer_role: 'owner'
    }], error: null});

    const requests = await service.listAccessRequests();

    expect(rpc).toHaveBeenCalledOnceWith('list_stats_access_requests');
    expect(requests[0]).toEqual(jasmine.objectContaining({
      id: 'request-id', status: 'pending', viewerRole: 'owner'
    }));
  });

  it('loads another user snapshot only through the consent-aware RPC', async () => {
    rpc.and.resolveTo({data: {
      ownerDisplayName: 'Owner', snapshotDate: '2026-09-01',
      topTracks: [{id: 'track'}], topArtists: [{id: 'artist'}],
      topGenres: [{name: 'indie', weight: 8}, {name: 'pop', weight: 2}]
    }, error: null});

    const snapshot = await service.loadSharedStats('owner-id', 'short_term');

    expect(rpc).toHaveBeenCalledOnceWith('get_shared_stats_snapshot', {
      p_owner_user_id: 'owner-id', p_range: 'short_term'
    });
    expect(snapshot?.topGenres).toEqual([
      {name: 'indie', count: 8, percentage: 8},
      {name: 'pop', count: 2, percentage: 2}
    ]);
  });

  it('subscribes to access changes and removes its realtime channel', () => {
    const onChange = jasmine.createSpy('onChange');
    const unsubscribe = service.subscribeToAccessChanges(onChange);

    expect(channel.on).toHaveBeenCalledWith('postgres_changes', jasmine.objectContaining({
      event: '*', schema: 'public', table: 'stats_access_requests'
    }), jasmine.any(Function));
    changeHandler?.();
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeChannel).toHaveBeenCalledOnceWith(channel);
  });
});
