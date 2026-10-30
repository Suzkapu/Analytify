import {afterEach, describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminModerationReport, AdminUserSyncSettings, SyncSchedulePolicy} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function setup() {
  const service = {
    updateSiteSettings: vi.fn().mockResolvedValue(undefined),
    updateSyncSchedulePolicy: vi.fn().mockResolvedValue(undefined),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([]),
    updateUser: vi.fn().mockResolvedValue(undefined), listUsers: vi.fn().mockResolvedValue([]),
    enqueueUser: vi.fn().mockResolvedValue(1), listRuns: vi.fn().mockResolvedValue([]),
    reviewPendingProfile: vi.fn(), deleteReviewedPendingProfile: vi.fn().mockResolvedValue(undefined),
    updateModerationReport: vi.fn().mockResolvedValue(undefined), listModerationReports: vi.fn().mockResolvedValue([]),
    createDemoLeague: vi.fn().mockResolvedValue('synthetic-league'), sendTestNotification: vi.fn()
  };
  const router = {navigate: vi.fn().mockResolvedValue(true)};
  return {service, router, component: new AdminComponent(service as unknown as AdminService, router as unknown as Router)};
}
const user: AdminUserSyncSettings = {userId: 'synthetic-user', spotifyId: 'pending:synthetic-user', displayName: 'Synthetic user',
    profilePicUrl: '', backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'UTC',
    historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
    shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days',
    longTermEnabled: false, longTermIntervalHours: 7, longTermIntervalUnit: 'days',
    songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
    songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: false, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastSuccessAt: null, lastError: null, requiredTasks: {}};
const policy: SyncSchedulePolicy = {taskKey: 'listening_history', available: true, intervalValue: 1, intervalUnit: 'hours'};
const report = {reportId: 'synthetic-report', receiptCode: 'TEST-ONLY', status: 'resolved_no_action', decisionReason: 'Synthetic review'} as AdminModerationReport;
afterEach(() => vi.restoreAllMocks());

describe('retained administration mutation boundaries', () => {
  it('holds one site-settings write, reports failure and permits an explicit retry', async () => {
    const {component, service} = setup();
    const write = held<void>();
    service.updateSiteSettings.mockReturnValueOnce(write.promise);
    component.siteSettings = {announcement: 'Synthetic maintenance', allowSongLeagueCreation: false};
    const first = component.saveSiteSettings();
    await component.saveSiteSettings();
    expect(component.isSavingSite).toBe(true);
    expect(service.updateSiteSettings).toHaveBeenCalledExactlyOnceWith(component.siteSettings);
    write.reject(new Error('Synthetic permission denial'));
    await first;
    expect(component.isSavingSite).toBe(false);
    expect(component.successMessage).toBe('');
    expect(component.errorMessage).toBe('Synthetic permission denial');
    await component.saveSiteSettings();
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toBe('Website settings saved.');
    expect(service.updateSiteSettings).toHaveBeenCalledTimes(2);
    expect(service.sendTestNotification).not.toHaveBeenCalled();
  });

  it('keeps a schedule save busy through dependent reads and surfaces a failed user refresh', async () => {
    const {component, service} = setup();
    component.schedulePolicies = [policy];
    const refreshed = held<AdminUserSyncSettings[]>();
    service.loadSyncSchedulePolicy.mockResolvedValue([policy]);
    service.listUsers.mockReturnValueOnce(refreshed.promise);
    const first = component.saveSchedulePolicy(policy);
    await Promise.resolve(); await Promise.resolve();
    await component.saveSchedulePolicy(policy);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith(policy);
    expect(component.savingPolicies.has(policy.taskKey)).toBe(true);
    refreshed.reject({details: 'Synthetic user inventory unavailable'});
    await first;
    expect(component.schedulePolicies).toEqual([policy]);
    expect(component.errorMessage).toBe('Synthetic user inventory unavailable');
    expect(component.successMessage).toBe('');
    expect(component.savingPolicies.size).toBe(0);
    await component.saveSchedulePolicy(policy);
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toBe('Listening history limit saved.');
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledTimes(1);
  });

  it('keeps cached users after a committed save followed by a failed read, then recovers', async () => {
    const {component, service} = setup();
    component.users = [user];
    const write = held<void>();
    service.updateUser.mockReturnValueOnce(write.promise);
    service.listUsers.mockRejectedValueOnce(new Error('Synthetic read failure'));
    const first = component.saveUser(user);
    await component.saveUser(user);
    expect(service.updateUser).toHaveBeenCalledExactlyOnceWith(user);
    expect(component.isUserBusy(user.userId)).toBe(true);
    write.resolve(); await first;
    expect(component.users).toEqual([user]);
    expect(component.errorMessage).toBe('Synthetic read failure');
    expect(component.isUserBusy(user.userId)).toBe(false);
    await component.saveUser(user);
    expect(component.users).toEqual([]);
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toContain('Synchronization settings saved');
  });

  it('does not duplicate queued work while audit refresh is pending and exposes refresh failure', async () => {
    const {component, service} = setup();
    const audit = held<never[]>();
    service.listRuns.mockReturnValueOnce(audit.promise);
    const first = component.runUserNow(user);
    await Promise.resolve();
    await component.runUserNow(user);
    expect(service.enqueueUser).toHaveBeenCalledExactlyOnceWith(user);
    expect(component.queueingUsers.has(user.userId)).toBe(true);
    audit.reject(new Error('Synthetic audit outage')); await first;
    expect(component.successMessage).toBe('1 task queued for Synthetic user.');
    expect(component.errorMessage).toBe('Synthetic audit outage');
    expect(component.queueingUsers.size).toBe(0);
    service.enqueueUser.mockResolvedValueOnce(0);
    await component.runUserNow(user);
    expect(component.successMessage).toContain('already queued or running');
    expect(component.errorMessage).toBe('');
  });

  it('never offers deletion for a server-ineligible registration', async () => {
    const {component, service} = setup();
    service.reviewPendingProfile.mockResolvedValue({eligible: false, spotifyId: user.spotifyId, blockers: ['Credentials exist.', 'Linked reports exist.']});
    await component.reviewIncompleteProfile(user);
    expect(component.pendingProfileReview?.phase).toBe('blocked');
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('Credentials exist. Linked reports exist.');
    expect(component.reviewingUsers.size).toBe(0);
  });

  it('honors Cancel after an eligible review without deleting or refreshing the inventory', async () => {
    const {component, service} = setup();
    service.reviewPendingProfile.mockResolvedValue({eligible: true, spotifyId: user.spotifyId, blockers: []});
    const action = component.reviewIncompleteProfile(user);
    await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    component.dismissPendingProfileReview(); await action;
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    expect(service.listUsers).not.toHaveBeenCalled();
    expect(component.successMessage).toBe('');
    expect(component.reviewingUsers.size).toBe(0);
  });

  it('uses the reviewed server identity, suppresses duplicate review and retains rows on deletion denial', async () => {
    const {component, service} = setup();
    component.users = [user];
    const review = held<{eligible: boolean; spotifyId: string; blockers: string[]}>();
    service.reviewPendingProfile.mockReturnValueOnce(review.promise);
    service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Registration changed after review'));
    const first = component.reviewIncompleteProfile(user);
    await component.reviewIncompleteProfile(user);
    expect(service.reviewPendingProfile).toHaveBeenCalledExactlyOnceWith(user.userId);
    review.resolve({eligible: true, spotifyId: 'pending:server-reviewed', blockers: []});
    await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    expect(component.pendingProfileReview?.spotifyId).toBe('pending:server-reviewed');
    component.confirmPendingProfileDeletion(); await first;
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledExactlyOnceWith(user.userId, 'pending:server-reviewed');
    expect(component.users).toEqual([user]);
    expect(service.listUsers).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('Registration changed after review');
    expect(component.reviewingUsers.size).toBe(0);
  });

  it('holds moderation through the audit read, retains cached decisions on failure and allows retry', async () => {
    const {component, service} = setup();
    component.moderationReports = [report];
    const audit = held<AdminModerationReport[]>();
    service.listModerationReports.mockReturnValueOnce(audit.promise);
    const first = component.saveModerationReport(report);
    await Promise.resolve();
    await component.saveModerationReport(report);
    expect(service.updateModerationReport).toHaveBeenCalledExactlyOnceWith(report);
    expect(component.savingModerationReports.has(report.reportId)).toBe(true);
    audit.reject(new Error('Synthetic moderation audit unavailable')); await first;
    expect(component.moderationReports).toEqual([report]);
    expect(component.successMessage).toBe('');
    expect(component.errorMessage).toBe('Synthetic moderation audit unavailable');
    expect(component.savingModerationReports.size).toBe(0);
    const refreshed = {...report, decisionReason: 'Server reviewed decision'};
    service.listModerationReports.mockResolvedValue([refreshed]);
    await component.saveModerationReport(report);
    expect(component.moderationReports).toEqual([refreshed]);
    expect(component.successMessage).toBe('TEST-ONLY updated and recorded in the audit trail.');
    expect(component.errorMessage).toBe('');
  });

  it('suppresses duplicate demo creation and recovers when navigation rejects', async () => {
    const {component, service, router} = setup();
    const creation = held<string>();
    service.createDemoLeague.mockReturnValueOnce(creation.promise);
    router.navigate.mockRejectedValueOnce(new Error('Synthetic navigation rejection'));
    component.demoName = '  Synthetic league  ';
    const first = component.createDemoLeague();
    await component.createDemoLeague();
    expect(service.createDemoLeague).toHaveBeenCalledExactlyOnceWith('Synthetic league', expect.any(String));
    creation.resolve('created-league'); await first;
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/song-league', 'created-league']);
    expect(component.errorMessage).toBe('Synthetic navigation rejection');
    expect(component.isCreatingDemo).toBe(false);
  });

  it('releases the demo busy state and explains a cancelled navigation', async () => {
    const {component, service, router} = setup();
    router.navigate.mockResolvedValueOnce(false);
    await component.createDemoLeague();
    expect(service.createDemoLeague).toHaveBeenCalledTimes(1);
    expect(component.isCreatingDemo).toBe(false);
    expect(component.errorMessage).toMatch(/navigat|open/i);
    expect(component.errorMessage).toContain('synthetic-league');
  });
});
