export type StatsAccessStatus = 'pending' | 'approved' | 'declined' | 'revoked';

export interface StatsShareableUser {
  userId: string;
  displayName: string;
  imageUrl: string;
  requestId: string | null;
  requestStatus: StatsAccessStatus | null;
}

export interface StatsAccessRequest {
  id: string;
  ownerUserId: string;
  viewerUserId: string;
  ownerDisplayName: string;
  ownerImageUrl: string;
  viewerDisplayName: string;
  viewerImageUrl: string;
  status: StatsAccessStatus;
  requestedAt: string;
  respondedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
  viewerRole: 'owner' | 'viewer';
}

export interface SharedStatsSnapshot {
  ownerUserId: string;
  ownerDisplayName: string;
  ownerImageUrl: string;
  snapshotDate: string;
  topTracks: any[];
  topArtists: any[];
  topGenres: Array<{name: string; count: number; percentage: number}>;
}
