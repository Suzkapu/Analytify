export type SyncTaskKey =
  | 'listening_history'
  | 'stats_short_term'
  | 'stats_medium_term'
  | 'stats_long_term'
  | 'song_league_playlists'
  | 'shared_playlists';

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
  shortTermEnabled: boolean;
  shortTermIntervalHours: number;
  mediumTermEnabled: boolean;
  mediumTermIntervalHours: number;
  longTermEnabled: boolean;
  longTermIntervalHours: number;
  songLeaguePlaylistsEnabled: boolean;
  songLeaguePlaylistIntervalMinutes: number;
  sharedPlaylistsEnabled: boolean;
  sharedPlaylistIntervalMinutes: number;
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
