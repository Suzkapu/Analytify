import {Component, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {Router} from '@angular/router';

import {AdminService} from '@core/admin/admin.service';
import {AdminModerationReport, AdminOperationalHealth, AdminSyncRun, AdminUserSyncSettings, SiteSettings, SyncSchedulePolicy, SyncTaskKey} from '@core/admin/admin.models';

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AdminComponent implements OnInit {
  siteSettings: SiteSettings = {announcement: '', allowSongLeagueCreation: true};
  users: AdminUserSyncSettings[] = [];
  schedulePolicies: SyncSchedulePolicy[] = [];
  runs: AdminSyncRun[] = [];
  moderationReports: AdminModerationReport[] = [];
  operationalHealth: AdminOperationalHealth = {
    syncQueueDepth: 0, oldestSyncQueueAgeSeconds: 0,
    notificationQueueDepth: 0, oldestNotificationQueueAgeSeconds: 0, expiredLeases: 0,
    lastSuccessByFeature: {}, releases: {},
    workerRuntime: {
      state: 'never_observed', startedAt: null, lastHeartbeatAt: null, secondsSinceHeartbeat: null,
      lastPassStartedAt: null, lastPassSucceededAt: null, lastFailureAt: null, lastError: null, commitSha: null
    }, alerts: []
  };
  isRunsCollapsed = true;
  expandedUsers = new Set<string>();
  isLoading = true;
  isSavingSite = false;
  savingPolicies = new Set<string>();
  isRefreshingRuns = false;
  savingUsers = new Set<string>();
  queueingUsers = new Set<string>();
  reviewingUsers = new Set<string>();
  savingModerationReports = new Set<string>();
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
      [this.siteSettings, this.users, this.runs, this.operationalHealth, this.schedulePolicies, this.moderationReports] = await Promise.all([
        this.admin.loadSiteSettings(), this.admin.listUsers(), this.admin.listRuns(),
        this.admin.loadOperationalHealth(), this.admin.loadSyncSchedulePolicy(), this.admin.listModerationReports()
      ]);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The admin dashboard could not be loaded.');
    } finally {
      this.isLoading = false;
    }
  }

  async saveSchedulePolicy(policy: SyncSchedulePolicy): Promise<void> {
    if (this.savingPolicies.has(policy.taskKey)) return;
    this.savingPolicies.add(policy.taskKey);
    this.clearMessages();
    try {
      await this.admin.updateSyncSchedulePolicy(policy);
      this.schedulePolicies = await this.admin.loadSyncSchedulePolicy();
      this.users = await this.admin.listUsers();
      this.successMessage = `${this.taskLabel(policy.taskKey)} limit saved.`;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The schedule limit could not be saved.');
    } finally {
      this.savingPolicies.delete(policy.taskKey);
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
      const refreshed = await this.admin.listUsers();
      this.users = refreshed;
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

  isIncompleteProfile(user: AdminUserSyncSettings): boolean {
    return user.spotifyId.startsWith('pending:');
  }

  async reviewIncompleteProfile(user: AdminUserSyncSettings): Promise<void> {
    if (this.reviewingUsers.has(user.userId)) return;
    this.reviewingUsers.add(user.userId);
    this.clearMessages();
    try {
      const review = await this.admin.reviewPendingProfile(user.userId);
      if (!review.eligible) {
        this.errorMessage = `This incomplete registration was kept: ${review.blockers.join(' ')}`;
        return;
      }
      if (!window.confirm(`Delete the reviewed incomplete registration ${review.spotifyId}? No linked data or credentials were found.`)) return;
      await this.admin.deleteReviewedPendingProfile(user.userId, review.spotifyId);
      this.users = await this.admin.listUsers();
      this.successMessage = 'The reviewed incomplete registration was deleted.';
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The incomplete registration could not be reviewed.');
    } finally {
      this.reviewingUsers.delete(user.userId);
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

  async saveModerationReport(report: AdminModerationReport): Promise<void> {
    if (this.savingModerationReports.has(report.reportId)) return;
    this.savingModerationReports.add(report.reportId);
    this.clearMessages();
    try {
      await this.admin.updateModerationReport(report);
      this.moderationReports = await this.admin.listModerationReports();
      this.successMessage = `${report.receiptCode} updated and recorded in the audit trail.`;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The report decision could not be saved.');
    } finally {
      this.savingModerationReports.delete(report.reportId);
    }
  }

  toggleRunsCollapsed(): void {
    this.isRunsCollapsed = !this.isRunsCollapsed;
  }

  isUserExpanded(userId: string): boolean {
    return this.expandedUsers.has(userId);
  }

  toggleUserExpanded(userId: string): void {
    if (this.expandedUsers.has(userId)) {
      this.expandedUsers.delete(userId);
    } else {
      this.expandedUsers.add(userId);
    }
  }

  enabledTasksCount(user: AdminUserSyncSettings): number {
    return [
      user.enabled && user.historyEnabled,
      (user.enabled && user.shortTermEnabled) || !!user.requiredTasks?.stats_short_term,
      user.enabled && user.mediumTermEnabled,
      user.enabled && user.longTermEnabled,
      (user.enabled && user.songLeaguePlaylistsEnabled) || !!user.requiredTasks?.song_league_playlists,
      (user.enabled && user.sharedPlaylistsEnabled) || !!user.requiredTasks?.shared_playlists
    ].filter(Boolean).length;
  }

  requiredReason(user: AdminUserSyncSettings, task: SyncTaskKey): string | null {
    return user.requiredTasks?.[task] || null;
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

  get releaseIsConsistent(): boolean {
    const expectedComponents = [
      'supabase', 'worker', 'edge:spotify-credentials',
      'edge:song-league-playlist-sync', 'edge:song-league-notifications'
    ];
    const commits = expectedComponents.map(component => this.operationalHealth.releases[component]).filter(Boolean);
    return commits.length === expectedComponents.length && new Set(commits).size === 1;
  }

  get workerStateLabel(): string {
    const state = this.operationalHealth.workerRuntime?.state || 'never_observed';
    return ({
      healthy: 'Worker healthy',
      starting: 'Worker starting',
      stale: 'Worker heartbeat stale',
      stopped: 'Worker stopped',
      never_observed: 'Worker never observed'
    } as const)[state];
  }

  get workerStateIsProblem(): boolean {
    return ['stale', 'stopped', 'never_observed'].includes(
      this.operationalHealth.workerRuntime?.state || 'never_observed'
    );
  }

  releaseLabel(component: string): string {
    return ({
      supabase: 'Supabase schema', worker: 'Sync worker',
      'edge:spotify-credentials': 'Spotify credentials',
      'edge:song-league-playlist-sync': 'League playlist sync',
      'edge:song-league-notifications': 'League notifications'
    } as Record<string, string>)[component] || component;
  }

  trackUser(_: number, user: AdminUserSyncSettings): string { return user.userId; }
  trackRun(_: number, run: AdminSyncRun): string { return run.id; }

  runWarnings(run: AdminSyncRun): string[] {
    const warnings = run.details?.['warnings'];
    return Array.isArray(warnings) ? warnings.filter((warning): warning is string => typeof warning === 'string') : [];
  }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }

  private describeError(error: unknown, fallback: string): string {
    return (error as any)?.message || (error as any)?.details || fallback;
  }
}
