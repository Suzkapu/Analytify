import {
  assertCompareMessageBounds,
  MAX_COMPARE_CHUNK_TRACKS,
  MAX_COMPARE_MESSAGE_BYTES,
  proposalContentHash
} from './compare-room-integrity';
import {CompareMergeProposal, CompareTrack} from './compare-room.models';

describe('Compare Room integrity', () => {
  it('binds the approval hash to the proposal tracks and metadata', async () => {
    const proposal = makeProposal();
    const originalHash = await proposalContentHash(proposal);
    const substitutedHash = await proposalContentHash({
      ...proposal,
      tracks: [{...proposal.tracks[0], id: 'attacker-track', uri: 'spotify:track:attacker-track'}]
    });

    expect(originalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(substitutedHash).not.toBe(originalHash);
  });

  it('rejects flooding through oversized messages and chunks', () => {
    const tracks = Array.from({length: MAX_COMPARE_CHUNK_TRACKS + 1}, (_, index) => track(`track-${index}`));
    expect(() => assertCompareMessageBounds({
      type: 'participant-track-chunk', participantId: 'guest', tracks
    })).toThrowError(/limited to 100 tracks/);
    expect(() => assertCompareMessageBounds({type: 'room-closed', padding: 'x'.repeat(MAX_COMPARE_MESSAGE_BYTES)}))
      .toThrowError(/too large/);
  });

  function makeProposal(): CompareMergeProposal {
    return {
      id: 'proposal-secure',
      contentHash: '',
      name: 'Shared songs',
      description: 'Approved description',
      descriptionsByParticipant: {guest: 'Guest description'},
      mode: 'intersection',
      tracks: [track('approved-track')],
      trackCount: 1,
      participantNames: ['Host', 'Guest'],
      participantStats: []
    };
  }

  function track(id: string): CompareTrack {
    return {
      id,
      uri: `spotify:track:${id}`,
      name: id,
      artists: [{id: 'artist', name: 'Artist'}],
      albumName: 'Album',
      imageUrl: '',
      spotifyUrl: `https://open.spotify.com/track/${id}`,
      playlistIndex: 1
    };
  }
});
