import {Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Optional} from '@angular/core';
import {Router} from '@angular/router';

import {AdminService} from '@core/admin/admin.service';
import {AdminModerationReport, AdminSyncRun, AdminUserSyncSettings, SiteSettings, SyncSchedulePolicy, SyncTaskKey} from '@core/admin/admin.models';
import {AdminRunFeedbackState} from './admin-run-feedback.component';
import {AdminPendingReviewView} from './admin-pending-review-state';
import {AdminUserSaveState} from './admin-user-save-state';
import {hasUserScheduleChanges, mergeUserScheduleDraft} from './admin-user-schedule-draft';
import {AdminUserScheduleDraft, hasValidUserIntervals} from './admin-user-interval-validation';

interface UserInventory { users: AdminUserSyncSettings[]; revision: number; }

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AdminComponent implements OnInit, OnDestroy {
  private destroyed = false;
  private loadGeneration = 0;
  private refreshGeneration = 0;
  private runsGeneration = 0;
  private userInventoryRevision = 0;
  private userInventoryVersions = new Map<string, number>();
  private userScheduleBaselines = new Map<string, AdminUserSyncSettings>();
  siteSettings: SiteSettings = {announcement: '', allowSongLeagueCreation: true};
  users: AdminUserScheduleDraft[] = [];
  schedulePolicies: SyncSchedulePolicy[] = [];
  runs: AdminSyncRun[] = [];
  runsError = '';
  moderationReports: AdminModerationReport[] = [];
  isRunsCollapsed = true;
  expandedUsers = new Set<string>();
  isLoading = true;
  isSavingSite = false;
  savingPolicies = new Set<string>();
  policyMessages = new Map<string, string>();
  policyRefreshRequired = new Set<string>();
  isRefreshingRuns = false;
  savingUsers = new Set<string>();
  userSaveStates = new Map<string, AdminUserSaveState>();
  userReadbackRequired = new Map<string, AdminUserSyncSettings>();
  queueingUsers = new Set<string>();
  reviewingUsers = new Set<string>();
  pendingProfileReview: AdminPendingReviewView | null = null;
  pendingProfileReviewReturnFocus: HTMLElement | null = null;
  readonly pendingProfileReconciliations = new Map<string, {view: AdminPendingReviewView; acknowledged: boolean; inFlight: boolean}>();
  private pendingReviewGeneration = 0;
  private pendingReviewDecision: ((confirmed: boolean) => void) | null = null;
  private reconcilingProfiles = new Set<string>();
  savingModerationReports = new Set<string>();
  demoName = 'Admin Demo League';
  isCreatingDemo = false;
  isSendingTestNotification = false;
  successMessage = '';
  errorMessage = '';

  constructor(private admin: AdminService, private router: Router,
              @Optional() private changeDetector?: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    this.closePendingProfileReview();
    this.destroyed = true;
    this.loadGeneration++;
    this.runsGeneration++;
  }

  private invalidateLoad(): void {
    this.loadGeneration++;
    this.isLoading = false;
  }

  private isActionCurrent(refresh: number): boolean {
    return !this.destroyed && refresh === this.refreshGeneration;
  }

  async load(): Promise<void> {
    if (this.destroyed) return;
    this.closePendingProfileReview();
    const generation = ++this.loadGeneration;
    this.refreshGeneration++;
    this.runsGeneration++;
    this.isRefreshingRuns = false;
    this.isLoading = true;
    this.errorMessage = '';
    this.userSaveStates.clear();
    try {
      const result = await Promise.all([
        this.admin.loadSiteSettings(), this.readUserInventory(), this.admin.listRuns(),
        this.admin.loadSyncSchedulePolicy(), this.admin.listModerationReports()
      ]);
      if (this.destroyed || generation !== this.loadGeneration) return;
      const [settings, inventory, runs, policies, reports] = result;
      this.siteSettings = settings;
      this.publishUserInventory(inventory);
      for (const [id, reconciliation] of this.pendingProfileReconciliations) {
        if (!reconciliation.inFlight && (!reconciliation.acknowledged || !inventory.users.some(user => user.userId === id))) this.pendingProfileReconciliations.delete(id);
      }
      this.runs = runs;
      this.schedulePolicies = policies;
      this.moderationReports = reports;
      this.runsError = '';
      this.userReadbackRequired.clear();
    } catch (error) {
      if (!this.destroyed && generation === this.loadGeneration) {
        this.errorMessage = this.describeError(error, 'The admin dashboard could not be loaded.');
        for (const userId of this.userReadbackRequired.keys()) this.userSaveStates.set(userId, 'read-error');
      }
    } finally {
      if (!this.destroyed && generation === this.loadGeneration) {
        this.isLoading = false;
        this.changeDetector?.markForCheck();
      }
    }
  }

  async saveSchedulePolicy(policy: SyncSchedulePolicy): Promise<void> {
    if (this.destroyed || this.savingPolicies.has(policy.taskKey)) return;
    if (this.policyRefreshRequired.has(policy.taskKey)) return this.refreshPolicy(policy);
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.clearMessages();
    const multiplier = {minutes: 1, hours: 60, days: 1440}[policy.intervalUnit];
    if (!multiplier || !Number.isInteger(policy.intervalValue) || policy.intervalValue < 1 || policy.intervalValue * multiplier > 10080) {
      this.errorMessage = 'Enter a whole interval from 1–10080 minutes, 1–168 hours or 1–7 days.';
      this.policyMessages.set(policy.taskKey, this.errorMessage);
      return;
    }
    this.savingPolicies.add(policy.taskKey);
    this.policyMessages.set(policy.taskKey, 'Saving this policy. Other policies remain available.');
    let saved = false;
    try {
      await this.admin.updateSyncSchedulePolicy(policy);
      if (!this.isActionCurrent(refresh)) return;
      saved = true;
      if (!await this.reloadPolicy(policy, refresh)) return;
      this.successMessage = `${this.taskLabel(policy.taskKey)} limit saved.`;
      this.policyMessages.set(policy.taskKey, this.successMessage);
    } catch (error) {
      if (!this.isActionCurrent(refresh)) return;
      this.errorMessage = this.describeError(error, 'The schedule limit could not be saved.');
      if (saved) this.policyRefreshRequired.add(policy.taskKey);
      this.policyMessages.set(policy.taskKey, saved
        ? 'Policy saved, but current user schedules could not be refreshed. Refresh without saving again.'
        : this.errorMessage);
    } finally {
      this.savingPolicies.delete(policy.taskKey);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  async refreshPolicy(policy: SyncSchedulePolicy): Promise<void> {
    if (this.destroyed || this.savingPolicies.has(policy.taskKey)) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.savingPolicies.add(policy.taskKey);
    this.clearMessages();
    try {
      if (!await this.reloadPolicy(policy, refresh)) return;
      this.policyRefreshRequired.delete(policy.taskKey);
      this.successMessage = `${this.taskLabel(policy.taskKey)} limit saved.`;
      this.policyMessages.set(policy.taskKey, this.successMessage);
    } catch (error) {
      if (!this.isActionCurrent(refresh)) return;
      this.errorMessage = this.describeError(error, 'Current schedules could not be refreshed.');
      this.policyRefreshRequired.add(policy.taskKey);
      this.policyMessages.set(policy.taskKey, 'Policy saved, but current user schedules could not be refreshed. Refresh without saving again.');
    } finally {
      this.savingPolicies.delete(policy.taskKey);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  private async reloadPolicy(policy: SyncSchedulePolicy, refresh: number): Promise<boolean> {
    const [policies, inventory] = await Promise.all([this.admin.loadSyncSchedulePolicy(), this.readUserInventory()]);
    if (!this.isActionCurrent(refresh)) return false;
    const refreshed = policies.find(value => value.taskKey === policy.taskKey);
    if (refreshed) this.schedulePolicies = this.schedulePolicies.map(value => value.taskKey === policy.taskKey ? refreshed : value);
    this.publishUserInventory(inventory);
    return true;
  }

  async saveSiteSettings(): Promise<void> {
    if (this.destroyed || this.isSavingSite) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.isSavingSite = true;
    this.clearMessages();
    try {
      await this.admin.updateSiteSettings(this.siteSettings);
      if (!this.isActionCurrent(refresh)) return;
      this.successMessage = 'Website settings saved.';
    } catch (error) {
      if (this.isActionCurrent(refresh)) this.errorMessage = this.describeError(error, 'Website settings could not be saved.');
    } finally {
      this.isSavingSite = false;
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  async saveUser(user: AdminUserScheduleDraft): Promise<void> {
    if (this.destroyed || this.isUserBusy(user.userId)) return;
    if (this.userReadbackRequired.has(user.userId)) return this.refreshUserSettings(user);
    if (!hasValidUserIntervals(user)) {
      this.clearMessages();
      this.userSaveStates.set(user.userId, 'validation');
      this.changeDetector?.markForCheck();
      return;
    }
    const submitted = {...user};
    this.markUserWrite(user.userId);
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.savingUsers.add(user.userId);
    this.userSaveStates.set(user.userId, 'saving');
    this.clearMessages();
    let saved = false;
    try {
      await this.admin.updateUser(submitted);
      if (!this.isActionCurrent(refresh)) return;
      saved = true;
      this.markUserWrite(user.userId);
      this.userReadbackRequired.set(user.userId, submitted);
      await this.reloadSavedUser(submitted, refresh);
    } catch (error) {
      if (this.isActionCurrent(refresh) && (!saved || this.userReadbackRequired.has(user.userId))) {
        this.errorMessage = this.describeError(error, `Settings for ${user.displayName} could not be saved.`);
        this.userSaveStates.set(user.userId, saved ? 'read-error' : 'save-error');
      }
    } finally {
      this.savingUsers.delete(user.userId);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  async refreshUserSettings(user: AdminUserScheduleDraft): Promise<void> {
    if (this.destroyed || this.isUserBusy(user.userId)) return;
    const submitted = this.userReadbackRequired.get(user.userId);
    if (!submitted) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.savingUsers.add(user.userId);
    this.userSaveStates.set(user.userId, 'refreshing');
    this.clearMessages();
    try {
      await this.reloadSavedUser(submitted, refresh);
    } catch (error) {
      if (this.isActionCurrent(refresh) && this.userReadbackRequired.has(user.userId)) {
        this.errorMessage = this.describeError(error, `Current settings for ${user.displayName} could not be refreshed.`);
        this.userSaveStates.set(user.userId, 'read-error');
      }
    } finally {
      this.savingUsers.delete(user.userId);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  private async readUserInventory(): Promise<UserInventory> {
    const revision = ++this.userInventoryRevision;
    return {users: await this.admin.listUsers(), revision};
  }

  private markUserWrite(userId: string): void {
    this.userInventoryVersions.set(userId, ++this.userInventoryRevision);
  }

  private publishUserInventory(inventory: UserInventory,
    selection?: {userId: string; submitted?: AdminUserSyncSettings}): void {
    const current = new Map(this.users.map(user => [user.userId, user]));
    const incoming = new Map(inventory.users.filter(user => !this.pendingProfileReconciliations.get(user.userId)?.acknowledged)
      .map(user => [user.userId, user]));
    const ids = selection ? [selection.userId]
      : [...incoming.keys(), ...[...current.keys()].filter(id => !incoming.has(id))];
    const merged = new Map(current);
    for (const id of ids) {
      // A response started before a newer write or accepted read cannot rewind it.
      if (inventory.revision < (this.userInventoryVersions.get(id) ?? 0)) continue;
      this.userInventoryVersions.set(id, inventory.revision);
      const server = incoming.get(id);
      if (!server) {
        merged.delete(id);
        this.userScheduleBaselines.delete(id);
        this.userSaveStates.delete(id);
        this.userReadbackRequired.delete(id);
        continue;
      }
      const baseline = selection?.submitted ?? this.userScheduleBaselines.get(id);
      const pendingSave = !selection?.submitted && (this.savingUsers.has(id) || this.userReadbackRequired.has(id));
      merged.set(id, mergeUserScheduleDraft(current.get(id), baseline, server, pendingSave));
      this.userScheduleBaselines.set(id, {...server});
    }
    this.users = selection
      ? this.users.flatMap(user => user.userId === selection.userId ? (merged.has(user.userId) ? [merged.get(user.userId)!] : []) : [user])
      : ids.flatMap(id => merged.has(id) ? [merged.get(id)!] : []);
  }

  private async reloadSavedUser(submitted: AdminUserSyncSettings, refresh: number): Promise<void> {
    const inventory = await this.readUserInventory();
    if (!this.isActionCurrent(refresh)) return;
    this.publishUserInventory(inventory, {userId: submitted.userId, submitted});
    const current = this.users.find(user => user.userId === submitted.userId);
    const server = this.userScheduleBaselines.get(submitted.userId);
    const newerDraft = current && server && hasUserScheduleChanges(current, server);
    this.userReadbackRequired.delete(submitted.userId);
    this.userSaveStates.set(submitted.userId, newerDraft ? 'newer-draft' : 'saved');
    this.successMessage = `Synchronization settings saved for ${submitted.displayName}.`;
  }

  async runUserNow(user: AdminUserScheduleDraft): Promise<void> {
    if (this.destroyed || this.isUserBusy(user.userId)) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.queueingUsers.add(user.userId);
    this.clearMessages();
    try {
      const queued = await this.admin.enqueueUser(user);
      if (!this.isActionCurrent(refresh)) return;
      this.successMessage = queued
        ? `${queued} task${queued === 1 ? '' : 's'} queued for ${user.displayName}.`
        : `All enabled tasks for ${user.displayName} are already queued or running.`;
      await this.refreshRuns();
    } catch (error) {
      if (this.isActionCurrent(refresh)) this.errorMessage = this.describeError(error, `Tasks for ${user.displayName} could not be queued.`);
    } finally {
      this.queueingUsers.delete(user.userId);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  isIncompleteProfile(user: AdminUserScheduleDraft): boolean {
    return user.spotifyId.startsWith('pending:');
  }

  async reviewIncompleteProfile(user: AdminUserScheduleDraft, trigger: HTMLElement | null = null): Promise<void> {
    if (this.destroyed || this.pendingProfileReview || this.isUserBusy(user.userId)) return;
    this.pendingProfileReviewReturnFocus = trigger;
    this.invalidateLoad();
    const refresh = this.refreshGeneration, generation = ++this.pendingReviewGeneration;
    const view: AdminPendingReviewView = {phase: 'reviewing', userId: user.userId, displayName: user.displayName,
      spotifyId: user.spotifyId, createdAt: '', blockers: [], message: ''};
    this.pendingProfileReview = view;
    this.reviewingUsers.add(user.userId);
    this.clearMessages();
    const current = () => this.isActionCurrent(refresh) && generation === this.pendingReviewGeneration;
    let deleting = false, acknowledged = false;
    try {
      const review = await this.admin.reviewPendingProfile(user.userId);
      if (!current()) return;
      const reviewed = {...view, spotifyId: review.spotifyId, createdAt: typeof review.createdAt === 'string' ? review.createdAt : '',
        blockers: [...review.blockers]};
      if (review.eligible !== true) {
        const message = `This incomplete registration was kept: ${review.blockers.join(' ')}`;
        this.pendingProfileReview = {...reviewed, phase: 'blocked', message};
        this.errorMessage = message;
        return;
      }
      if (typeof review.spotifyId !== 'string' || !/^pending:\S+$/.test(review.spotifyId) || review.blockers.length) {
        this.pendingProfileReview = {...reviewed, phase: 'review-error', message: 'The server review could not establish a safe pending identity. Review again.'};
        return;
      }
      this.pendingProfileReview = {...reviewed, phase: 'eligible'};
      this.changeDetector?.markForCheck();
      const confirmed = await new Promise<boolean>(resolve => {this.pendingReviewDecision = resolve;});
      if (!confirmed || !current()) return;
      deleting = true;
      this.pendingProfileReview = {...reviewed, phase: 'deleting'};
      this.pendingProfileReconciliations.set(user.userId, {view: reviewed, acknowledged: false, inFlight: true});
      await this.admin.deleteReviewedPendingProfile(user.userId, reviewed.spotifyId);
      if (this.destroyed) return;
      acknowledged = true;
      this.markUserWrite(user.userId);
      this.pendingProfileReconciliations.set(user.userId, {view: reviewed, acknowledged: true, inFlight: false});
      this.users = this.users.filter(candidate => candidate.userId !== user.userId);
      this.userScheduleBaselines.delete(user.userId);
      this.userSaveStates.delete(user.userId);
      this.userReadbackRequired.delete(user.userId);
      if (!current()) return;
      this.successMessage = 'The reviewed incomplete registration was deleted.';
      this.pendingProfileReview = {...reviewed, phase: 'deleted-refreshing'};
      await this.readPendingProfileReconciliation(user.userId, refresh, generation);
    } catch (error) {
      const reconciliation = this.pendingProfileReconciliations.get(user.userId);
      if (deleting && reconciliation) reconciliation.inFlight = false;
      if (current()) {
        const message = this.describeError(error, deleting ? 'The deletion result could not be confirmed. Refresh the current registration before taking another action.' : 'The incomplete registration could not be reviewed.');
        this.errorMessage = message;
        this.pendingProfileReview = {...(this.pendingProfileReview ?? view), phase: acknowledged ? 'deleted-read-error' : deleting ? 'delete-error' : 'review-error', message};
      }
    } finally {
      if (generation === this.pendingReviewGeneration) this.reviewingUsers.delete(user.userId);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  confirmPendingProfileDeletion(): void {
    if (this.destroyed || this.pendingProfileReview?.phase !== 'eligible') return;
    const resolve = this.pendingReviewDecision;
    this.pendingReviewDecision = null;
    resolve?.(true);
  }

  async retryPendingProfileReview(): Promise<void> {
    const view = this.pendingProfileReview;
    if (!view || !['review-error', 'blocked'].includes(view.phase) || this.destroyed) return;
    const user = this.users.find(candidate => candidate.userId === view.userId);
    this.closePendingProfileReview();
    if (user) await this.reviewIncompleteProfile(user, this.pendingProfileReviewReturnFocus);
  }

  async reconcilePendingProfileDeletion(): Promise<void> {
    const view = this.pendingProfileReview;
    if (!view || this.destroyed || !['delete-error', 'deleted-read-error'].includes(view.phase) || this.reconcilingProfiles.has(view.userId)) return;
    const generation = this.pendingReviewGeneration, refresh = this.refreshGeneration;
    const reconciliation = this.pendingProfileReconciliations.get(view.userId);
    if (!reconciliation) return;
    this.pendingProfileReview = {...view, phase: reconciliation.acknowledged ? 'deleted-refreshing' : 'reconciling', message: ''};
    this.reconcilingProfiles.add(view.userId);
    try {
      await this.readPendingProfileReconciliation(view.userId, refresh, generation);
    } catch (error) {
      if (this.isActionCurrent(refresh) && generation === this.pendingReviewGeneration) {
        const message = this.describeError(error, 'The current registration could not be refreshed.');
        this.pendingProfileReview = {...view, phase: reconciliation.acknowledged ? 'deleted-read-error' : 'delete-error', message};
        this.errorMessage = message;
      }
    } finally {
      this.reconcilingProfiles.delete(view.userId);
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  private async readPendingProfileReconciliation(userId: string, refresh: number, generation: number): Promise<void> {
    const reconciliation = this.pendingProfileReconciliations.get(userId);
    if (!reconciliation) return;
    const inventory = await this.readUserInventory();
    if (!this.isActionCurrent(refresh) || generation !== this.pendingReviewGeneration) return;
    if (reconciliation.acknowledged && inventory.users.some(user => user.userId === userId)) {
      throw new Error('Deletion was confirmed, but the current inventory still lists the registration. Refresh again.');
    }
    this.publishUserInventory(inventory, {userId});
    this.pendingProfileReconciliations.delete(userId);
    this.errorMessage = '';
    this.successMessage = reconciliation.acknowledged ? 'The reviewed incomplete registration was deleted.'
      : inventory.users.some(user => user.userId === userId) ? 'The current registration was refreshed. Review it again before deletion.'
        : 'The registration is no longer listed.';
    this.closePendingProfileReview();
  }

  dismissPendingProfileReview(): void {
    const view = this.pendingProfileReview;
    if (view && ['deleting', 'deleted-refreshing', 'reconciling'].includes(view.phase)) return;
    if (view?.phase === 'delete-error') {
      this.errorMessage = `The deletion result is uncertain. Use Administration Refresh before taking another action on this registration. ${view.message}`.trim();
    } else if (view?.phase === 'deleted-read-error') {
      this.successMessage = 'The reviewed incomplete registration was deleted.';
      this.errorMessage = `Deletion was confirmed. Use Administration Refresh to recover the current inventory without deleting again. ${view.message}`.trim();
    }
    this.closePendingProfileReview();
  }

  private closePendingProfileReview(): void {
    this.pendingReviewGeneration++;
    const userId = this.pendingProfileReview?.userId;
    this.pendingProfileReview = null;
    const resolve = this.pendingReviewDecision;
    this.pendingReviewDecision = null;
    resolve?.(false);
    if (userId) this.reviewingUsers.delete(userId);
  }

  async refreshRuns(): Promise<void> {
    if (this.destroyed || this.isRefreshingRuns) return;
    this.invalidateLoad();
    const generation = ++this.runsGeneration;
    if (this.errorMessage === this.runsError) this.errorMessage = '';
    this.runsError = '';
    this.isRefreshingRuns = true;
    try {
      const runs = await this.admin.listRuns();
      if (this.destroyed || generation !== this.runsGeneration) return;
      this.runs = runs;
    } catch (error) {
      if (!this.destroyed && generation === this.runsGeneration) {
        this.runsError = this.describeError(error, 'Recent synchronization runs could not be loaded.');
        this.errorMessage = this.runsError;
      }
    } finally {
      if (!this.destroyed && generation === this.runsGeneration) {
        this.isRefreshingRuns = false;
        this.changeDetector?.markForCheck();
      }
    }
  }

  get runsFeedbackState(): AdminRunFeedbackState | null {
    if (this.isRefreshingRuns) return this.runs.length ? 'refreshing' : 'loading';
    if (this.runsError) return this.runs.length ? 'refresh-error' : 'load-error';
    return this.runs.length ? null : 'empty';
  }

  async saveModerationReport(report: AdminModerationReport): Promise<void> {
    if (this.destroyed || this.savingModerationReports.has(report.reportId)) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.savingModerationReports.add(report.reportId);
    this.clearMessages();
    try {
      await this.admin.updateModerationReport(report);
      if (!this.isActionCurrent(refresh)) return;
      const reports = await this.admin.listModerationReports();
      if (!this.isActionCurrent(refresh)) return;
      this.moderationReports = this.moderationReports.flatMap(value => value.reportId === report.reportId
        ? reports.filter(candidate => candidate.reportId === report.reportId) : [value]);
      this.successMessage = `${report.receiptCode} updated and recorded in the audit trail.`;
    } catch (error) {
      if (this.isActionCurrent(refresh)) this.errorMessage = this.describeError(error, 'The report decision could not be saved.');
    } finally {
      this.savingModerationReports.delete(report.reportId);
      if (!this.destroyed) this.changeDetector?.markForCheck();
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

  enabledTasksCount(user: AdminUserScheduleDraft): number {
    return [
      user.enabled && user.historyEnabled,
      (user.enabled && user.shortTermEnabled) || !!user.requiredTasks?.stats_short_term,
      user.enabled && user.mediumTermEnabled,
      user.enabled && user.longTermEnabled,
      (user.enabled && user.songLeaguePlaylistsEnabled) || !!user.requiredTasks?.song_league_playlists,
      (user.enabled && user.sharedPlaylistsEnabled) || !!user.requiredTasks?.shared_playlists
    ].filter(Boolean).length;
  }

  requiredReason(user: AdminUserScheduleDraft, task: SyncTaskKey): string | null {
    return user.requiredTasks?.[task] || null;
  }

  async createDemoLeague(): Promise<void> {
    if (this.destroyed || this.isCreatingDemo) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.isCreatingDemo = true;
    this.clearMessages();
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vienna';
      const leagueId = await this.admin.createDemoLeague(this.demoName.trim() || 'Admin Demo League', timezone);
      if (!this.isActionCurrent(refresh)) return;
      const opened = await this.router.navigate(['/song-league', leagueId]);
      if (!this.isActionCurrent(refresh)) return;
      if (!opened) throw new Error(`Demo league ${leagueId} was created, but could not be opened. Open it from Song Leagues.`);
    } catch (error) {
      if (this.isActionCurrent(refresh)) this.errorMessage = this.describeError(error, 'The demo league could not be created.');
    } finally {
      this.isCreatingDemo = false;
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  async sendTestNotification(): Promise<void> {
    if (this.destroyed || this.isSendingTestNotification) return;
    this.invalidateLoad();
    const refresh = this.refreshGeneration;
    this.isSendingTestNotification = true;
    this.clearMessages();
    try {
      const sent = await this.admin.sendTestNotification();
      if (!this.isActionCurrent(refresh)) return;
      this.successMessage = `Test notification sent to ${sent} registered PWA ${sent === 1 ? 'device' : 'devices'}.`;
    } catch (error) {
      if (this.isActionCurrent(refresh)) this.errorMessage = this.describeError(error, 'The test notification could not be sent.');
    } finally {
      this.isSendingTestNotification = false;
      if (!this.destroyed) this.changeDetector?.markForCheck();
    }
  }

  isUserBusy(userId: string): boolean {
    return this.savingUsers.has(userId) || this.queueingUsers.has(userId) || this.reviewingUsers.has(userId) || this.pendingProfileReconciliations.has(userId);
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

  trackUser(_: number, user: AdminUserScheduleDraft): string { return user.userId; }
  trackRun(_: number, run: AdminSyncRun): string { return run.id; }

  private clearMessages(): void {
    this.successMessage = '';
    this.errorMessage = '';
  }

  private describeError(error: unknown, fallback: string): string {
    return (error as any)?.message || (error as any)?.details || fallback;
  }
}
