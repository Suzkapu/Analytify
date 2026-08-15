import {Injectable} from '@angular/core';

import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {AdminSyncRun, AdminUserSyncSettings, SiteSettings, SyncTaskKey} from './admin.models';

@Injectable({providedIn: 'root'})
export class AdminService {
  private adminPromise: Promise<boolean> | null = null;

  constructor(private supabase: SupabaseService) {}

  isAdmin(refresh = false): Promise<boolean> {
    if (!this.adminPromise || refresh) {
      this.adminPromise = Promise.resolve(this.supabase.client.rpc('is_app_admin')).then(({data, error}) => {
        if (error) return false;
        return data === true;
      });
    }
    return this.adminPromise!;
  }

  async loadSiteSettings(): Promise<SiteSettings> {
    const {data, error} = await this.supabase.client.rpc('get_public_site_settings');
    if (error) throw error;
    const row = data?.[0] || {};
    return {
      announcement: row.announcement || '',
      allowSongLeagueCreation: row.allow_song_league_creation !== false
    };
  }

  async updateSiteSettings(settings: SiteSettings): Promise<void> {
    const {error} = await this.supabase.client.rpc('admin_update_site_settings', {
      p_announcement: settings.announcement,
      p_allow_song_league_creation: settings.allowSongLeagueCreation
    });
    if (error) throw error;
  }

  async listUsers(): Promise<AdminUserSyncSettings[]> {
    const {data, error} = await this.supabase.client.rpc('admin_list_users');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      userId: row.user_id,
      spotifyId: row.spotify_id,
      displayName: row.display_name,
      profilePicUrl: row.profile_pic_url || '',
      backupActive: !!row.backup_active,
      hasRefreshToken: !!row.has_refresh_token,
      enabled: !!row.enabled,
      timezone: row.timezone || 'Europe/Vienna',
      historyEnabled: !!row.history_enabled,
      historyIntervalMinutes: Number(row.history_interval_minutes || 60),
      shortTermEnabled: !!row.short_term_enabled,
      shortTermIntervalHours: Number(row.short_term_interval_hours || 24),
      mediumTermEnabled: !!row.medium_term_enabled,
      mediumTermIntervalHours: Number(row.medium_term_interval_hours || 168),
      longTermEnabled: !!row.long_term_enabled,
      longTermIntervalHours: Number(row.long_term_interval_hours || 168),
      songLeaguePlaylistsEnabled: !!row.song_league_playlists_enabled,
      songLeaguePlaylistIntervalMinutes: Number(row.song_league_playlist_interval_minutes || 60),
      sharedPlaylistsEnabled: !!row.shared_playlists_enabled,
      sharedPlaylistIntervalMinutes: Number(row.shared_playlist_interval_minutes || 60),
      lastSuccessAt: row.last_success_at || null,
      lastError: row.last_error || null
    }));
  }

  async updateUser(settings: AdminUserSyncSettings): Promise<void> {
    const {error} = await this.supabase.client.rpc('admin_update_sync_user', {
      p_user_id: settings.userId,
      p_enabled: settings.enabled,
      p_timezone: settings.timezone,
      p_history_enabled: settings.historyEnabled,
      p_history_interval_minutes: settings.historyIntervalMinutes,
      p_short_term_enabled: settings.shortTermEnabled,
      p_short_term_interval_hours: settings.shortTermIntervalHours,
      p_medium_term_enabled: settings.mediumTermEnabled,
      p_medium_term_interval_hours: settings.mediumTermIntervalHours,
      p_long_term_enabled: settings.longTermEnabled,
      p_long_term_interval_hours: settings.longTermIntervalHours,
      p_song_league_playlists_enabled: settings.songLeaguePlaylistsEnabled,
      p_song_league_playlist_interval_minutes: settings.songLeaguePlaylistIntervalMinutes,
      p_shared_playlists_enabled: settings.sharedPlaylistsEnabled,
      p_shared_playlist_interval_minutes: settings.sharedPlaylistIntervalMinutes
    });
    if (error) throw error;
  }

  async enqueueUser(settings: AdminUserSyncSettings): Promise<number> {
    const tasks: SyncTaskKey[] = [];
    if (settings.historyEnabled) tasks.push('listening_history');
    if (settings.shortTermEnabled) tasks.push('stats_short_term');
    if (settings.mediumTermEnabled) tasks.push('stats_medium_term');
    if (settings.longTermEnabled) tasks.push('stats_long_term');
    if (settings.songLeaguePlaylistsEnabled) tasks.push('song_league_playlists');
    if (settings.sharedPlaylistsEnabled) tasks.push('shared_playlists');
    const {data, error} = await this.supabase.client.rpc('admin_enqueue_sync', {
      p_user_id: settings.userId,
      p_task_keys: tasks
    });
    if (error) throw error;
    return Number(data || 0);
  }

  async listRuns(limit = 50): Promise<AdminSyncRun[]> {
    const {data, error} = await this.supabase.client.rpc('admin_list_sync_runs', {p_limit: limit});
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      taskKey: row.task_key,
      status: row.status,
      triggerType: row.trigger_type,
      requestedAt: row.requested_at,
      startedAt: row.started_at || null,
      finishedAt: row.finished_at || null,
      error: row.error || null,
      details: row.details || {}
    }));
  }

  async createDemoLeague(name: string, timezone: string): Promise<string> {
    const {data, error} = await this.supabase.client.rpc('admin_create_demo_league', {
      p_name: name,
      p_timezone: timezone
    });
    if (error) throw error;
    const leagueId = String(data || '');
    if (!leagueId) throw new Error('The demo league was not created.');
    return leagueId;
  }
}
