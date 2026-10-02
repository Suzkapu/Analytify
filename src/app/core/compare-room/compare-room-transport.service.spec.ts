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
});
