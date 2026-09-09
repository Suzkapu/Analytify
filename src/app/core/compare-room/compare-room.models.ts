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
  durationMs?: number;
  explicit?: boolean;
  releaseDate?: string;
}

export interface ComparePlaylist {
  id: string;
  name: string;
  description?: string;
  imageUrl: string;
  total: number;
  ownerName: string;
  isLikedSongs?: boolean;
  snapshotId?: string;
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
  approvedProposalHash?: string;
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
  operationId?: string;
  operationFingerprint?: string;
  recovery?: ComparePlaylistRecovery;
  error?: string;
}

export interface ComparePlaylistSaveOptions {
  /** Stable ID supplied by a workflow when it already has one (for example, a proposal ID). */
  operationId?: string;
  /** Spotify account ID, when the caller already resolved it. */
  accountId?: string;
  /** Caller-owned content/version fingerprint, when one exists. */
  fingerprint?: string;
  signal?: AbortSignal;
}

export interface ComparePlaylistOperation {
  operationId: string;
  accountId: string;
  fingerprint: string;
}

export interface ComparePlaylistRecovery {
  source: 'created' | 'local-mapping' | 'spotify-discovery' | 'stale-mapping-recreated';
  recovered: boolean;
  stalePlaylistId?: string;
}

export interface CompareMergeProposal {
  id: string;
  contentHash: string;
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
  | {type: 'invitation-claimed'; invitationId: string; participantId: string}
  | {type: 'participant-state'; participant: CompareParticipant}
  | {type: 'participant-track-chunk'; participantId: string; tracks: CompareTrack[]}
  | {type: 'participant-tracks-complete'; participant: CompareParticipant; total: number}
  | {type: 'participant-left'; participantId: string; reason: 'left' | 'disconnected'}
  | {type: 'remove-participant'; participantId: string}
  | {type: 'merge-proposal'; proposal: CompareMergeProposal}
  | {type: 'merge-proposal-cancelled'; reason?: string}
  | {type: 'proposal-approval'; participantId: string; proposalId: string; contentHash: string}
  | {type: 'create-playlist-start'; proposal: CompareMergeProposal}
  | {type: 'create-playlist-track-chunk'; proposalId: string; tracks: CompareTrack[]}
  | {type: 'create-playlist-commit'; proposalId: string}
  | {type: 'save-result'; participantId: string; result: CompareSaveResult}
  | {type: 'room-closed'};

export interface CompareRoomEnvelope {
  id: number;
  senderParticipantId: string;
  senderRole: 'host' | 'guest';
  sequence: number;
  message: CompareRoomMessage;
}

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
