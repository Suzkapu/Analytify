export type StatsAccessStatus = 'pending' | 'approved' | 'declined' | 'revoked';

export interface StatsShareableUser {
  userId: string;
  displayName: string;
  imageUrl: string;
  requestId: string | null;
  requestStatus: StatsAccessStatus | null;
}

export interface BlockedStatsUser {
  userId: string;
  displayName: string;
  imageUrl: string;
  blockedAt: string;
}

export type ModerationStatus = 'submitted' | 'under_review' | 'resolved_action' | 'resolved_no_action' | 'appealed';

export interface ModerationReceipt {
  reportId: string;
  receiptCode: string;
  status: ModerationStatus;
}

export interface ModerationCase extends ModerationReceipt {
  viewerRole: 'reporter' | 'affected';
  category: 'user_safety' | 'illegal_content';
  reason: string;
  outcome: string;
  decisionReason: string;
  notice: string;
  createdAt: string;
  resolvedAt: string | null;
  appealedAt: string | null;
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

export interface CreatedStatsAccessInvite {
  inviteId: string;
  claimToken: string;
  claimUrl: string;
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
