export type SyncTaskKey =
  | 'listening_history'
  | 'stats_short_term'
  | 'stats_medium_term'
  | 'stats_long_term'
  | 'song_league_playlists'
  | 'shared_playlists';

export type SyncIntervalUnit = 'minutes' | 'hours' | 'days';

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
  songLeaguePlaylistIntervalMinutes: number;
  songLeaguePlaylistIntervalUnit: SyncIntervalUnit;
  sharedPlaylistsEnabled: boolean;
  sharedPlaylistIntervalMinutes: number;
  sharedPlaylistIntervalUnit: SyncIntervalUnit;
  lastSuccessAt: string | null;
  lastError: string | null;
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
