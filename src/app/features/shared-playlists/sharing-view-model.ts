import {ModerationStatus, StatsAccessRequest, StatsAccessStatus} from '@core/sharing/stats-sharing.models';

export type SharingTab = 'playlists' | 'stats';
export type SharingStatusTone = 'neutral' | 'success' | 'danger' | 'attention';

export interface SharingStatusView {
  label: string;
  description: string;
  tone: SharingStatusTone;
}

export function parseSharingTab(value: string | null): SharingTab {
  return value === 'stats' ? 'stats' : 'playlists';
}

export function statsAccessStatusView(
  status: StatsAccessStatus,
  role: StatsAccessRequest['viewerRole']
): SharingStatusView {
  switch (status) {
    case 'pending':
      return role === 'owner'
        ? {label: 'Needs your decision', description: 'They asked to view your stats', tone: 'attention'}
        : {label: 'Waiting for approval', description: 'Your request has not been answered yet', tone: 'attention'};
    case 'approved':
      return role === 'owner'
        ? {label: 'Access active', description: 'They can view your saved stats', tone: 'success'}
        : {label: 'Access active', description: 'You can view their saved stats', tone: 'success'};
    case 'declined':
      return {label: 'Declined', description: 'The request was declined', tone: 'danger'};
    case 'revoked':
      return {label: 'Access ended', description: 'This stats access is no longer active', tone: 'neutral'};
  }
}

export function moderationStatusLabel(status: ModerationStatus): string {
  switch (status) {
    case 'submitted': return 'Report received';
    case 'under_review': return 'Under review';
    case 'resolved_action': return 'Action taken';
    case 'resolved_no_action': return 'Review complete';
    case 'appealed': return 'Appeal under review';
  }
}
