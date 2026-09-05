import {CompareMergeProposal, CompareTrack} from './compare-room.models';

export const MAX_COMPARE_TRACKS = 5000;
export const MAX_COMPARE_CHUNK_TRACKS = 100;
export const MAX_COMPARE_MESSAGE_BYTES = 128 * 1024;

function canonicalTrack(track: CompareTrack) {
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: (track.artists || []).map(artist => ({id: artist.id, name: artist.name})),
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    spotifyUrl: track.spotifyUrl,
    playlistIndex: track.playlistIndex,
    durationMs: track.durationMs ?? null,
    explicit: track.explicit ?? null,
    releaseDate: track.releaseDate ?? null
  };
}

export function canonicalProposal(proposal: Omit<CompareMergeProposal, 'contentHash'> | CompareMergeProposal): string {
  return JSON.stringify({
    id: proposal.id,
    name: proposal.name,
    description: proposal.description,
    descriptionsByParticipant: Object.fromEntries(
      Object.entries(proposal.descriptionsByParticipant || {}).sort(([left], [right]) => left.localeCompare(right))
    ),
    mode: proposal.mode || 'intersection',
    tracks: proposal.tracks.map(canonicalTrack),
    trackCount: proposal.trackCount,
    participantNames: proposal.participantNames,
    participantStats: proposal.participantStats || []
  });
}

export async function proposalContentHash(
  proposal: Omit<CompareMergeProposal, 'contentHash'> | CompareMergeProposal
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalProposal(proposal));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function assertCompareMessageBounds(message: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
  if (bytes > MAX_COMPARE_MESSAGE_BYTES) throw new Error('Compare Room message is too large.');

  const candidate = message as any;
  if (candidate?.type === 'participant-track-chunk' || candidate?.type === 'create-playlist-track-chunk') {
    if (!Array.isArray(candidate.tracks) || candidate.tracks.length === 0 ||
      candidate.tracks.length > MAX_COMPARE_CHUNK_TRACKS) {
      throw new Error(`Compare Room chunks are limited to ${MAX_COMPARE_CHUNK_TRACKS} tracks.`);
    }
  }
  if (candidate?.type === 'participant-tracks-complete' &&
    (!Number.isInteger(candidate.total) || candidate.total < 0 || candidate.total > MAX_COMPARE_TRACKS)) {
    throw new Error(`Compare Room participants are limited to ${MAX_COMPARE_TRACKS} tracks.`);
  }
  if ((candidate?.type === 'merge-proposal' || candidate?.type === 'create-playlist-start') &&
    (!Number.isInteger(candidate.proposal?.trackCount) || candidate.proposal.trackCount < 1 ||
      candidate.proposal.trackCount > MAX_COMPARE_TRACKS)) {
    throw new Error(`Compare Room results are limited to ${MAX_COMPARE_TRACKS} tracks.`);
  }
}
