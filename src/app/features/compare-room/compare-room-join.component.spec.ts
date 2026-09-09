import {describe, expect, it, vi} from 'vitest';
import {CompareRoomJoinComponent} from './compare-room-join.component';

describe('CompareRoomJoinComponent playlist recovery', () => {
  it('retries the approved proposal with the same stable operation and republishes only its result', async () => {
    const proposal: any = {
      id: 'proposal-id', contentHash: 'content-hash', name: 'Shared', description: 'Description',
      descriptionsByParticipant: {}, tracks: [], trackCount: 0, mode: 'union', participantStats: []
    };
    const publishSaveResult = vi.fn().mockName('publishSaveResult').mockResolvedValue(undefined);
    const createPlaylist = vi.fn().mockName('createPlaylist')
      .mockResolvedValueOnce({success: false, playlistName: 'Shared', playlistId: 'partial', addedTracks: 50, error: 'Batch failed'})
      .mockResolvedValueOnce({success: true, playlistName: 'Shared', playlistId: 'partial', addedTracks: 100});
    const component = new CompareRoomJoinComponent(
      {} as any, {} as any,
      {getAccessToken: vi.fn().mockResolvedValue('token')} as any,
      {publishSaveResult} as any,
      {createPlaylist} as any,
      {} as any
    );
    (component as any).roomId = 'room-id';
    component.participant = {
      id: 'participant-id', spotifyUserId: 'spotify-user', displayName: 'Guest', imageUrl: '',
      status: 'saving', tracks: []
    };
    component.proposal = proposal;
    component.hasApproved = true;

    await (component as any).createPlaylist(proposal);
    expect(component.stage).toBe('error');
    const firstOperation = createPlaylist.mock.calls[0][4];

    component.retryPlaylist();
    while (component.stage === 'saving') await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(createPlaylist.mock.calls[1][4]).toEqual(firstOperation);
    expect(firstOperation).toEqual({
      operationId: 'compare:room-id:proposal-id:spotify-user',
      accountId: 'spotify-user', fingerprint: 'content-hash'
    });
    expect(publishSaveResult).toHaveBeenCalledTimes(2);
    expect(component.stage).toBe('complete');
  });
});
