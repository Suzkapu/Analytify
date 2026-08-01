import {CompareParticipant} from './compare-room.models';
import {CompareRoomCoordinatorService} from './compare-room-coordinator.service';

describe('CompareRoomCoordinatorService', () => {
  it('lets the host cancel a claimed join before the participant finishes joining', async () => {
    const transport = {
      send: jasmine.createSpy('send').and.resolveTo()
    };
    const coordinator = new CompareRoomCoordinatorService(
      transport as any,
      {intersect: jasmine.createSpy('intersect')} as any
    );
    const lateParticipant: CompareParticipant = {
      id: 'joining-guest',
      spotifyUserId: 'guest-user',
      displayName: 'Joining guest',
      imageUrl: '',
      status: 'selecting',
      tracks: []
    };

    coordinator.invitations$.next([{
      id: 'claimed-invite',
      secret: 'secret',
      joinUrl: 'https://example.com/join',
      qrDataUrl: 'data:image/png;base64,qr',
      claimedBy: lateParticipant.id
    }]);
    (coordinator as any).acceptedParticipantIds.add(lateParticipant.id);

    await coordinator.cancelInvitation('claimed-invite');

    expect(coordinator.invitations$.value).toEqual([]);
    expect(transport.send).toHaveBeenCalledWith({
      type: 'remove-participant',
      participantId: lateParticipant.id
    });

    // A delayed guest state must not recreate the participant after cancellation.
    (coordinator as any).handleMessage({type: 'participant-state', participant: lateParticipant});
    expect(coordinator.participants$.value).toEqual([]);
  });
});
