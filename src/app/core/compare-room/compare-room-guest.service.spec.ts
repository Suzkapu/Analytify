import {CompareRoomGuestService} from './compare-room-guest.service';
import {proposalContentHash} from './compare-room-integrity';
import {CompareMergeProposal, CompareTrack} from './compare-room.models';

describe('CompareRoomGuestService', () => {
  it('does not create a playlist when approved proposal content is substituted', async () => {
    const transport = {send: jasmine.createSpy('send').and.resolveTo()};
    const guest = new CompareRoomGuestService(transport as any);
    const approved = proposal();
    approved.contentHash = await proposalContentHash(approved);
    const changedTrack = track('substituted');

    (guest as any).handleMessage({type: 'create-playlist-start', proposal: {...approved, tracks: []}});
    (guest as any).handleMessage({type: 'create-playlist-track-chunk', proposalId: approved.id, tracks: [changedTrack]});
    await (guest as any).commitCreateProposal(approved.id);

    expect(guest.createRequest$.value).toBeNull();
    expect(guest.error$.value).toContain('changed after you approved it');
  });

  it('rejects a replayed create commit', async () => {
    const guest = new CompareRoomGuestService({send: jasmine.createSpy('send').and.resolveTo()} as any);
    const approved = proposal();
    approved.contentHash = await proposalContentHash(approved);

    for (let attempt = 0; attempt < 2; attempt++) {
      (guest as any).handleMessage({type: 'create-playlist-start', proposal: {...approved, tracks: []}});
      (guest as any).handleMessage({type: 'create-playlist-track-chunk', proposalId: approved.id, tracks: approved.tracks});
      await (guest as any).commitCreateProposal(approved.id);
    }

    expect(guest.error$.value).toContain('lost or replayed');
  });

  function proposal(): CompareMergeProposal {
    return {
      id: 'proposal-secure', contentHash: '', name: 'Shared', description: 'Description',
      mode: 'intersection', tracks: [track('approved')], trackCount: 1,
      participantNames: ['Host', 'Guest']
    };
  }

  function track(id: string): CompareTrack {
    return {
      id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}],
      albumName: 'Album', imageUrl: '', spotifyUrl: '', playlistIndex: 1
    };
  }
});
