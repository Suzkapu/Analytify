import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';

import {AdminService} from '@core/admin/admin.service';
import {AdminSyncRun, AdminUserSyncSettings, SiteSettings, SyncTaskKey} from '@core/admin/admin.models';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  siteSettings: SiteSettings = {announcement: '', allowSongLeagueCreation: true};
  users: AdminUserSyncSettings[] = [];
  runs: AdminSyncRun[] = [];
  isLoading = true;
  isSavingSite = false;
  isRefreshingRuns = false;
  savingUsers = new Set<string>();
  queueingUsers = new Set<string>();
  demoName = 'Admin Demo League';
  isCreatingDemo = false;
  isSendingTestNotification = false;
  successMessage = '';
  errorMessage = '';

  constructor(private admin: AdminService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      [this.siteSettings, this.users, this.runs] = await Promise.all([
        this.admin.loadSiteSettings(), this.admin.listUsers(), this.admin.listRuns()
      ]);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The admin dashboard could not be loaded.');
    } finally {
      this.isLoading = false;
    }
  }

  async saveSiteSettings(): Promise<void> {
    if (this.isSavingSite) return;
    this.isSavingSite = true;
    this.clearMessages();
    try {
      await this.admin.updateSiteSettings(this.siteSettings);
      this.successMessage = 'Website settings saved.';
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Website settings could not be saved.');
    } finally {
      this.isSavingSite = false;
    }
  }

  async saveUser(user: AdminUserSyncSettings): Promise<void> {
    if (this.savingUsers.has(user.userId)) return;
    this.savingUsers.add(user.userId);
    this.clearMessages();
    try {
      await this.admin.updateUser(user);
      this.successMessage = `Synchronization settings saved for ${user.displayName}.`;
    } catch (error) {
      this.errorMessage = this.describeError(error, `Settings for ${user.displayName} could not be saved.`);
    } finally {
      this.savingUsers.delete(user.userId);
    }
  }

  async runUserNow(user: AdminUserSyncSettings): Promise<void> {
    if (this.queueingUsers.has(user.userId)) return;
    this.queueingUsers.add(user.userId);
    this.clearMessages();
    try {
      const queued = await this.admin.enqueueUser(user);
      this.successMessage = queued
        ? `${queued} task${queued === 1 ? '' : 's'} queued for ${user.displayName}.`
        : `All enabled tasks for ${user.displayName} are already queued or running.`;
      await this.refreshRuns();
    } catch (error) {
      this.errorMessage = this.describeError(error, `Tasks for ${user.displayName} could not be queued.`);
    } finally {
      this.queueingUsers.delete(user.userId);
    }
  }

  async refreshRuns(): Promise<void> {
    if (this.isRefreshingRuns) return;
    this.isRefreshingRuns = true;
    try {
      this.runs = await this.admin.listRuns();
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Recent synchronization runs could not be loaded.');
    } finally {
      this.isRefreshingRuns = false;
    }
  }

  async createDemoLeague(): Promise<void> {
    if (this.isCreatingDemo) return;
    this.isCreatingDemo = true;
    this.clearMessages();
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vienna';
      const leagueId = await this.admin.createDemoLeague(this.demoName.trim() || 'Admin Demo League', timezone);
      await this.router.navigate(['/song-league', leagueId]);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The demo league could not be created.');
      this.isCreatingDemo = false;
    }
  }

  async sendTestNotification(): Promise<void> {
    if (this.isSendingTestNotification) return;
    this.isSendingTestNotification = true;
    this.clearMessages();
    try {
      const sent = await this.admin.sendTestNotification();
      this.successMessage = `Test notification sent to ${sent} registered PWA ${sent === 1 ? 'device' : 'devices'}.`;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The test notification could not be sent.');
    } finally {
      this.isSendingTestNotification = false;
    }
  }

  isUserBusy(userId: string): boolean {
    return this.savingUsers.has(userId) || this.queueingUsers.has(userId);
  }

  taskLabel(task: SyncTaskKey): string {
    return ({
      listening_history: 'Listening history',
      stats_short_term: 'Short-term stats',
      stats_medium_term: 'Medium-term stats',
      stats_long_term: 'Long-term stats',
      song_league_playlists: 'League playlists',
      shared_playlists: 'Shared playlists'
    } as Record<SyncTaskKey, string>)[task];
  }

  trackUser(_: number, user: AdminUserSyncSettings): string { return user.userId; }
  trackRun(_: number, run: AdminSyncRun): string { return run.id; }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }

  private describeError(error: unknown, fallback: string): string {
    return (error as any)?.message || (error as any)?.details || fallback;
  }
}
