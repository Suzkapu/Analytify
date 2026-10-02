import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {CompareRoomTransportService} from './compare-room-transport.service';

describe('CompareRoomTransportService readiness', () => {
  let service: CompareRoomTransportService;
  const rpc = vi.fn();
  const getClient = vi.fn();
  const ensureCollaborationSession = vi.fn();

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({error: null});
    getClient.mockReset().mockResolvedValue({rpc});
    ensureCollaborationSession.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({providers: [
      CompareRoomTransportService,
      {provide: SupabaseService, useValue: {getClient, ensureCollaborationSession}}
    ]});
    service = TestBed.inject(CompareRoomTransportService);
  });

  it('waits for client readiness before creating an invitation', async () => {
    let resolveClient!: (client: any) => void;
    getClient.mockReturnValue(new Promise(resolve => { resolveClient = resolve; }));
    const invitation = service.createInvitation('invite-id', 'secret');
    expect(rpc).not.toHaveBeenCalled();
    resolveClient({rpc});
    await invitation;
    expect(rpc).toHaveBeenCalledWith('create_compare_room_invitation', {
      p_room_id: '', p_invitation_id: 'invite-id', p_invitation_secret: 'secret'
    });
  });

  it('does not revoke an invitation when client initialization fails', async () => {
    getClient.mockRejectedValue(new Error('Client unavailable'));
    await expect(service.revokeInvitation('invite-id')).rejects.toThrow('Client unavailable');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('establishes collaboration identity before creating a room', async () => {
    let resolveSession!: () => void;
    ensureCollaborationSession.mockReturnValue(new Promise<void>(resolve => { resolveSession = resolve; }));
    const creating = service.createRoom('room-id', 'host-id');
    expect(getClient).not.toHaveBeenCalled();
    resolveSession();
    await creating;
    expect(rpc).toHaveBeenCalledWith('create_compare_room', {
      p_room_id: 'room-id', p_host_participant_id: 'host-id'
    });
  });

  it('keeps disconnected presence reconciliation local', async () => {
    await service.touchPresence();
    await expect(service.reconcileParticipants()).resolves.toEqual([]);
    await service.leaveRoom();
    expect(getClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    (transport: CompareRoomTransportService) => transport.createInvitation('invite', 'secret'),
    (transport: CompareRoomTransportService) => transport.revokeInvitation('invite'),
    (transport: CompareRoomTransportService) => transport.closeRoom(),
    (transport: CompareRoomTransportService) => transport.touchPresence(),
    (transport: CompareRoomTransportService) => transport.reconcileParticipants(),
    (transport: CompareRoomTransportService) => transport.leaveRoom(),
    (transport: CompareRoomTransportService) => transport.send({type: 'room-closed'}),
    (transport: CompareRoomTransportService) => transport.sendCreation({type: 'create-playlist-commit', proposalId: 'proposal'})
  ])('does not redirect a pending room operation after disconnect (%#)', async operation => {
    const channel: any = {on: vi.fn(), subscribe: vi.fn(callback => callback('SUBSCRIBED'))};
    channel.on.mockReturnValue(channel);
    const client = {channel: () => channel, removeChannel: vi.fn().mockResolvedValue('ok'), rpc};
    getClient.mockResolvedValue(client);
    await service.connect('original-room', vi.fn());
    let resolveClient!: (client: any) => void;
    getClient.mockReturnValue(new Promise(resolve => { resolveClient = resolve; }));
    const pending = operation(service);
    const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await service.disconnect();
    resolveClient(client);
    await rejected;
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not open a channel after disconnect during readiness', async () => {
    let resolveClient!: (client: any) => void;
    getClient.mockReturnValue(new Promise(resolve => { resolveClient = resolve; }));
    const connecting = service.connect('room-id', vi.fn());
    const rejected = expect(connecting).rejects.toThrow('connection was cancelled');
    await vi.waitFor(() => expect(getClient).toHaveBeenCalled());
    await service.disconnect();
    const channel = vi.fn();
    resolveClient({channel});
    await rejected;
    expect(channel).not.toHaveBeenCalled();
  });

  it('removes the originating channel once and ignores messages after disconnect', async () => {
    const onMessage = vi.fn();
    let receive!: (payload: any) => void;
    const channel: any = {
      on: vi.fn().mockImplementation((_event, _filter, callback) => { receive = callback; return channel; }),
      subscribe: vi.fn().mockImplementation(callback => { callback('SUBSCRIBED'); return channel; })
    };
    const removeChannel = vi.fn().mockResolvedValue('ok');
    getClient.mockResolvedValue({channel: () => channel, removeChannel});
    await service.connect('room-id', onMessage);
    const payload = {new: {id: 1, payload: {type: 'hello'}, sequence: 1}};
    receive(payload);
    expect(onMessage).toHaveBeenCalledTimes(1);
    getClient.mockResolvedValue({removeChannel: vi.fn()});
    await service.disconnect();
    await service.disconnect();
    receive(payload);
    expect(removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('cancels an outstanding subscription immediately on disconnect', async () => {
    const channel: any = {on: vi.fn(), subscribe: vi.fn()};
    channel.on.mockReturnValue(channel);
    const removeChannel = vi.fn().mockResolvedValue('ok');
    getClient.mockResolvedValue({channel: () => channel, removeChannel});
    const connecting = service.connect('room-id', vi.fn());
    const rejected = expect(connecting).rejects.toThrow('connection was cancelled');
    await vi.waitFor(() => expect(channel.subscribe).toHaveBeenCalled());
    await service.disconnect();
    await rejected;
    expect(removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
  });

  it('keeps the newer connection when an older readiness request finishes late', async () => {
    let resolveFirst!: (client: any) => void;
    const channel: any = {on: vi.fn(), subscribe: vi.fn(callback => callback('SUBSCRIBED'))};
    channel.on.mockReturnValue(channel);
    const channelFactory = vi.fn().mockReturnValue(channel);
    const client = {channel: channelFactory, removeChannel: vi.fn().mockResolvedValue('ok')};
    getClient.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }));
    getClient.mockResolvedValue(client);
    const older = service.connect('old-room', vi.fn());
    const rejected = expect(older).rejects.toThrow('connection was cancelled');
    await vi.waitFor(() => expect(getClient).toHaveBeenCalledTimes(1));
    await service.connect('new-room', vi.fn());
    resolveFirst(client);
    await rejected;
    expect(channelFactory).toHaveBeenCalledExactlyOnceWith('compare-room:new-room', {config: {private: true}});
    expect(client.removeChannel).not.toHaveBeenCalled();
    await service.disconnect();
  });

  it('removes a channel when subscription times out and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      const channel: any = {on: vi.fn(), subscribe: vi.fn()};
      channel.on.mockReturnValue(channel);
      const removeChannel = vi.fn().mockResolvedValue('ok');
      getClient.mockResolvedValue({channel: () => channel, removeChannel});
      const connecting = service.connect('room-id', vi.fn());
      const rejected = expect(connecting).rejects.toThrow('Could not connect');
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      expect(removeChannel).toHaveBeenCalledExactlyOnceWith(channel);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
