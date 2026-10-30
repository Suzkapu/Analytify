export type SyncTaskKey =
  | 'listening_history'
  | 'stats_short_term'
  | 'stats_medium_term'
  | 'stats_long_term'
  | 'song_league_playlists'
  | 'shared_playlists';

export type SyncIntervalUnit = 'minutes' | 'hours' | 'days';

export interface SyncSchedulePolicy {
  taskKey: Exclude<SyncTaskKey, 'song_league_playlists' | 'shared_playlists'>;
  available: boolean;
  intervalValue: number;
  intervalUnit: SyncIntervalUnit;
}

export interface SiteSettings {
  announcement: string;
  allowSongLeagueCreation: boolean;
}

export interface AdminUserSyncSettings {
  userId: string;
  spotifyId: string;
  displayName: string;
  profilePicUrl: string;
  backupActive: boolean;
  hasRefreshToken: boolean;
  enabled: boolean;
  timezone: string;
  historyEnabled: boolean;
  historyIntervalMinutes: number;
  historyIntervalUnit: SyncIntervalUnit;
  shortTermEnabled: boolean;
  shortTermIntervalHours: number;
  shortTermIntervalUnit: SyncIntervalUnit;
  mediumTermEnabled: boolean;
  mediumTermIntervalHours: number;
  mediumTermIntervalUnit: SyncIntervalUnit;
  longTermEnabled: boolean;
  longTermIntervalHours: number;
  longTermIntervalUnit: SyncIntervalUnit;
  songLeaguePlaylistsEnabled: boolean;
  songLeaguePlaylistFridaysOnly: boolean;
  songLeaguePlaylistIntervalMinutes: number;
  songLeaguePlaylistIntervalUnit: SyncIntervalUnit;
  sharedPlaylistsEnabled: boolean;
  sharedPlaylistIntervalMinutes: number;
  sharedPlaylistIntervalUnit: SyncIntervalUnit;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextEffectiveRunAt?: string | null;
  manualJobRetained?: boolean;
  requiredTasks?: Partial<Record<SyncTaskKey, string>>;
}

export interface PendingProfileReview {
  eligible: boolean;
  spotifyId: string;
  createdAt: string;
  blockers: string[];
}

export interface AdminSyncRun {
  id: string;
  userId: string;
  displayName: string;
  taskKey: SyncTaskKey;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  triggerType: 'scheduled' | 'manual';
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  details: Record<string, unknown>;
}

export interface AdminModerationReport {
  reportId: string;
  receiptCode: string;
  category: 'user_safety' | 'illegal_content';
  status: 'submitted' | 'under_review' | 'resolved_action' | 'resolved_no_action' | 'appealed';
  reporterName: string;
  affectedName: string;
  reason: string;
  contentUrl: string;
  outcome: string;
  decisionReason: string;
  reporterNotice: string;
  affectedNotice: string;
  appealReason: string;
  createdAt: string;
  resolvedAt: string | null;
  appealedAt: string | null;
}
