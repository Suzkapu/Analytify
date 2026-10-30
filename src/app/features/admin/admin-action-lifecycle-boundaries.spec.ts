import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AdminService} from '@core/admin/admin.service';
import {AdminModerationReport, AdminUserSyncSettings, SyncSchedulePolicy} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
const policy: SyncSchedulePolicy = {taskKey: 'listening_history', available: true, intervalValue: 60, intervalUnit: 'minutes'};
const user: AdminUserSyncSettings = {userId: 'synthetic-user', spotifyId: 'pending:synthetic', displayName: 'Synthetic user',
    profilePicUrl: '', backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'UTC',
    historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
    shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days',
    longTermEnabled: false, longTermIntervalHours: 7, longTermIntervalUnit: 'days',
    songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
    songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: false, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastSuccessAt: null, lastError: null, requiredTasks: {}};
const report = {reportId: 'synthetic-report', receiptCode: 'TEST-ONLY'} as AdminModerationReport;
const review = {eligible: true, spotifyId: user.spotifyId, blockers: [], createdAt: '2026-10-26T00:00:00Z'};
async function setup() {
  const service = {
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}),
    listUsers: vi.fn().mockResolvedValue([]), listRuns: vi.fn().mockResolvedValue([]),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([policy]), listModerationReports: vi.fn().mockResolvedValue([]),
    updateSyncSchedulePolicy: vi.fn().mockResolvedValue(undefined), updateSiteSettings: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined), enqueueUser: vi.fn().mockResolvedValue(1),
    reviewPendingProfile: vi.fn().mockResolvedValue(review), deleteReviewedPendingProfile: vi.fn().mockResolvedValue(undefined),
    updateModerationReport: vi.fn().mockResolvedValue(undefined), createDemoLeague: vi.fn().mockResolvedValue('synthetic-league'),
    sendTestNotification: vi.fn().mockResolvedValue(1)
  };
  const router = {navigate: vi.fn().mockResolvedValue(true)};
  await TestBed.configureTestingModule({declarations: [AdminComponent], providers: [
    {provide: AdminService, useValue: service}, {provide: Router, useValue: router}
  ]}).overrideComponent(AdminComponent, {set: {template: ''}}).compileComponents();
  const fixture = TestBed.createComponent(AdminComponent);
  const component = fixture.componentInstance;
  component.schedulePolicies = [{...policy}];
  component.users = [user];
  component.moderationReports = [report];
  return {fixture, component, service, router};
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

describe('administration action ownership after leaving the route', () => {
  it('does not start policy readback after a held write completes on a destroyed route', async () => {
    const {fixture, component, service} = await setup();
    const write = held<void>(); service.updateSyncSchedulePolicy.mockReturnValue(write.promise);
    const action = component.saveSchedulePolicy(policy);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith(policy);
    fixture.destroy(); write.resolve(); await action;
    expect(service.loadSyncSchedulePolicy).not.toHaveBeenCalled();
    expect(service.listUsers).not.toHaveBeenCalled();
    expect(component.successMessage).toBe('');
  });

  it.each(['destroy', 'new load'] as const)('does not publish an old policy readback after %s', async transition => {
    const {fixture, component, service} = await setup();
    const readback = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(readback.promise);
    const action = component.refreshPolicy(policy);
    expect(service.listUsers).toHaveBeenCalledTimes(1);
    if (transition === 'destroy') fixture.destroy();
    else {
      service.listUsers.mockResolvedValue([{...user, displayName: 'New inventory'}]);
      await component.load();
    }
    const currentUsers = component.users;
    readback.resolve([{...user, displayName: 'Old inventory'}]); await action;
    expect(component.users).toEqual(currentUsers);
    expect(component.successMessage).toBe('');
    expect(component.errorMessage).toBe('');
  });

  it.each(['resolve', 'reject'] as const)('ignores a held site save %s after destruction', async outcome => {
    const {fixture, component, service} = await setup();
    const write = held<void>(); service.updateSiteSettings.mockReturnValue(write.promise);
    const action = component.saveSiteSettings(); fixture.destroy();
    if (outcome === 'resolve') write.resolve(); else write.reject(new Error('Old site failure'));
    await action;
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
  });

  it.each(['resolve', 'reject'] as const)('ignores a queued user %s without refreshing runs after destruction', async outcome => {
    const {fixture, component, service} = await setup();
    const queued = held<number>(); service.enqueueUser.mockReturnValue(queued.promise);
    const refresh = vi.spyOn(component, 'refreshRuns');
    const action = component.runUserNow(user); fixture.destroy();
    if (outcome === 'resolve') queued.resolve(2); else queued.reject(new Error('Old queue failure'));
    await action;
    expect(refresh).not.toHaveBeenCalled(); expect(service.listRuns).not.toHaveBeenCalled();
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
  });

  it('never opens a destructive confirmation when a profile review completes after navigation away', async () => {
    const {fixture, component, service} = await setup();
    const pending = held<typeof review>(); service.reviewPendingProfile.mockReturnValue(pending.promise);
    const action = component.reviewIncompleteProfile(user); fixture.destroy(); pending.resolve(review); await action;
    expect(component.pendingProfileReview).toBeNull(); expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    expect(service.listUsers).not.toHaveBeenCalled(); expect(component.successMessage).toBe('');
  });

  it('does not read private user inventory after a confirmed deletion finishes on a destroyed route', async () => {
    const {fixture, component, service} = await setup();
    const deleted = held<void>(); service.deleteReviewedPendingProfile.mockReturnValue(deleted.promise);
    const action = component.reviewIncompleteProfile(user);
    await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    component.confirmPendingProfileDeletion();
    await vi.waitFor(() => expect(service.deleteReviewedPendingProfile).toHaveBeenCalledExactlyOnceWith(user.userId, user.spotifyId));
    fixture.destroy(); deleted.resolve(); await action;
    expect(service.listUsers).not.toHaveBeenCalled(); expect(component.successMessage).toBe('');
  });

  it('does not read the private moderation inbox after a write finishes on a destroyed route', async () => {
    const {fixture, component, service} = await setup();
    const write = held<void>(); service.updateModerationReport.mockReturnValue(write.promise);
    const action = component.saveModerationReport(report); fixture.destroy(); write.resolve(); await action;
    expect(service.listModerationReports).not.toHaveBeenCalled(); expect(component.successMessage).toBe('');
  });

  it('does not navigate when demo creation resolves after route destruction', async () => {
    const {fixture, component, service, router} = await setup();
    const created = held<string>(); service.createDemoLeague.mockReturnValue(created.promise);
    const action = component.createDemoLeague(); fixture.destroy(); created.resolve('synthetic-league'); await action;
    expect(router.navigate).not.toHaveBeenCalled(); expect(component.errorMessage).toBe('');
  });

  it('settles demo creation without stale navigation when a newer dashboard load takes ownership', async () => {
    const {component, service, router} = await setup();
    const created = held<string>(); service.createDemoLeague.mockReturnValue(created.promise);
    const action = component.createDemoLeague();
    expect(component.isCreatingDemo).toBe(true);
    await component.load();
    created.resolve('synthetic-league'); await action;
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.isCreatingDemo).toBe(false);
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
  });

  it.each(['resolve', 'reject'] as const)('ignores a synthetic notification %s after route destruction', async outcome => {
    const {fixture, component, service} = await setup();
    const sent = held<number>(); service.sendTestNotification.mockReturnValue(sent.promise);
    const action = component.sendTestNotification(); fixture.destroy();
    if (outcome === 'resolve') sent.resolve(1); else sent.reject(new Error('Old synthetic response'));
    await action;
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
  });

  it.each(['resolve', 'reject'] as const)('ignores a moderation readback %s after a newer dashboard load', async outcome => {
    const {component, service} = await setup();
    const inbox = held<AdminModerationReport[]>();
    service.listModerationReports.mockReturnValueOnce(inbox.promise);
    const action = component.saveModerationReport(report);
    await vi.waitFor(() => expect(service.listModerationReports).toHaveBeenCalledTimes(1));
    const current = {...report, receiptCode: 'CURRENT-INBOX'};
    service.listModerationReports.mockResolvedValue([current]);
    await component.load();
    if (outcome === 'resolve') inbox.resolve([{...report, receiptCode: 'OLD-INBOX'}]);
    else inbox.reject(new Error('Old inbox failure'));
    await action;
    expect(component.moderationReports).toEqual([current]);
    expect(component.savingModerationReports.has(report.reportId)).toBe(false);
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
  });

  it('ignores an old policy readback rejection after a newer dashboard load', async () => {
    const {component, service} = await setup();
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const action = component.refreshPolicy(policy);
    service.listUsers.mockResolvedValue([{...user, displayName: 'Current inventory'}]);
    await component.load(); old.reject(new Error('Old policy inventory failure')); await action;
    expect(component.users[0].displayName).toBe('Current inventory');
    expect(component.errorMessage).toBe(''); expect(component.successMessage).toBe('');
    expect(component.policyRefreshRequired.has(policy.taskKey)).toBe(false);
    expect(component.savingPolicies.has(policy.taskKey)).toBe(false);
  });

  it.each(['save first', 'queue first'] as const)('does not start a conflicting action for the same user while %s is pending', async order => {
    const {component, service} = await setup();
    const write = held<void>(); const queued = held<number>();
    service.updateUser.mockReturnValue(write.promise); service.enqueueUser.mockReturnValue(queued.promise);
    const first = order === 'save first' ? component.saveUser(user) : component.runUserNow(user);
    expect(component.isUserBusy(user.userId)).toBe(true);
    const second = order === 'save first' ? component.runUserNow(user) : component.saveUser(user);
    // Release both promises even on a failing implementation, so no action leaks into another test.
    write.resolve(); queued.resolve(1); await Promise.all([first, second]);
    expect(service.updateUser).toHaveBeenCalledTimes(order === 'save first' ? 1 : 0);
    expect(service.enqueueUser).toHaveBeenCalledTimes(order === 'queue first' ? 1 : 0);
    expect(component.isUserBusy(user.userId)).toBe(false);
  });

  it('preserves another report unsaved decision while reading back one saved moderation report', async () => {
    const {component, service} = await setup();
    const draft = {...report, reportId: 'other-report', decisionReason: 'Unsaved independent review'};
    component.moderationReports = [report, draft];
    const saved = {...report, decisionReason: 'Persisted reviewed decision'};
    service.listModerationReports.mockResolvedValue([saved, {...draft, decisionReason: 'Older server decision'}]);
    await component.saveModerationReport(report);
    expect(service.updateModerationReport).toHaveBeenCalledExactlyOnceWith(report);
    expect(component.moderationReports.find(value => value.reportId === report.reportId)?.decisionReason).toBe('Persisted reviewed decision');
    expect(component.moderationReports.find(value => value.reportId === draft.reportId)?.decisionReason).toBe('Unsaved independent review');
  });

  it('removes only the confirmed absent pending profile while preserving another user unsaved timezone', async () => {
    const {component, service} = await setup();
    const draft = {...user, userId: 'other-user', spotifyId: 'other-spotify', timezone: 'Europe/Vienna'};
    component.users = [user, draft];
    service.listUsers.mockResolvedValue([{...draft, timezone: 'UTC'}]);
    const action = component.reviewIncompleteProfile(user);
    await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    component.confirmPendingProfileDeletion(); await action;
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledExactlyOnceWith(user.userId, user.spotifyId);
    expect(component.users.some(value => value.userId === user.userId)).toBe(false);
    expect(component.users.find(value => value.userId === draft.userId)?.timezone).toBe('Europe/Vienna');
  });

  it('does not initiate administrative effects from an already destroyed component', async () => {
    const {fixture, component, service, router} = await setup(); fixture.destroy();
    await component.saveSchedulePolicy(policy); await component.refreshPolicy(policy);
    await component.saveSiteSettings(); await component.saveUser(user); await component.runUserNow(user);
    await component.reviewIncompleteProfile(user); await component.saveModerationReport(report);
    await component.createDemoLeague(); await component.sendTestNotification();
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled(); expect(component.pendingProfileReview).toBeNull();
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
  });
});
