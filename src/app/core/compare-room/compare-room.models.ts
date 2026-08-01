export type CompareParticipantStatus =
  | 'waiting'
  | 'authorizing'
  | 'selecting'
  | 'loading'
  | 'ready'
  | 'disconnected'
  | 'saving'
  | 'complete'
  | 'error';

export interface CompareTrack {
  id: string;
  uri: string;
  name: string;
  artists: Array<{id: string; name: string}>;
  albumName: string;
  imageUrl: string;
  spotifyUrl: string;
  playlistIndex: number;
}

export interface ComparePlaylist {
  id: string;
  name: string;
  imageUrl: string;
  total: number;
  ownerName: string;
  isLikedSongs?: boolean;
}

export interface CompareParticipant {
  id: string;
  invitationId?: string;
  spotifyUserId: string;
  displayName: string;
  imageUrl: string;
  status: CompareParticipantStatus;
  playlist?: ComparePlaylist;
  playlists?: ComparePlaylist[];
  tracks: CompareTrack[];
  dataSource?: 'local' | 'cloud' | 'spotify';
  approvedProposalId?: string;
  result?: CompareSaveResult;
  isMainProfile?: boolean;
  error?: string;
}

export type CompareMergeMode = 'intersection' | 'union';

export interface CompareParticipantMergeStats {
  participantId: string;
  selectedPlaylistCount: number;
  selectedTrackCount: number;
  includedTrackCount: number;
  includedPercentage: number;
}

export interface CompareInvitation {
  id: string;
  secret: string;
  joinUrl: string;
  qrDataUrl: string;
  claimedBy?: string;
}

export interface CompareSaveResult {
  success: boolean;
  playlistName: string;
  playlistUrl?: string;
  playlistId?: string;
  addedTracks: number;
  error?: string;
}

export interface CompareMergeProposal {
  id: string;
  name: string;
  description: string;
  descriptionsByParticipant?: Record<string, string>;
  mode?: CompareMergeMode;
  tracks: CompareTrack[];
  trackCount: number;
  participantNames: string[];
  participantStats?: CompareParticipantMergeStats[];
}

export type CompareRoomMessage =
  | {type: 'join-request'; invitationId: string; invitationSecret: string; participantId: string}
  | {type: 'join-accepted'; participantId: string}
  | {type: 'join-rejected'; participantId: string; reason: string}
  | {type: 'participant-state'; participant: CompareParticipant}
  | {type: 'participant-track-chunk'; participantId: string; tracks: CompareTrack[]}
  | {type: 'participant-tracks-complete'; participant: CompareParticipant; total: number}
  | {type: 'remove-participant'; participantId: string}
  | {type: 'merge-proposal'; proposal: CompareMergeProposal}
  | {type: 'merge-proposal-cancelled'}
  | {type: 'proposal-approval'; participantId: string; proposalId: string}
  | {type: 'create-playlist-start'; proposal: CompareMergeProposal}
  | {type: 'create-playlist-track-chunk'; proposalId: string; tracks: CompareTrack[]}
  | {type: 'create-playlist-commit'; proposalId: string}
  | {type: 'save-result'; participantId: string; result: CompareSaveResult}
  | {type: 'room-closed'};

export interface SpotifyTransientSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
}

export interface CompareRoomAuthRequest {
  state: string;
  verifier: string;
  returnUrl: string;
  createdAt: number;
}
