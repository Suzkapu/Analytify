import {afterEach, describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminUserSyncSettings} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
const user = {userId: 'synthetic-pending', displayName: 'Synthetic registration', spotifyId: 'pending:local',
  timezone: 'UTC', enabled: false, historyEnabled: false, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
  shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours', mediumTermEnabled: false,
  mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days', longTermEnabled: false, longTermIntervalHours: 7,
  longTermIntervalUnit: 'days', songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
  songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes', sharedPlaylistsEnabled: false,
  sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes'} as AdminUserSyncSettings;
const review = {eligible: true, spotifyId: 'pending:server-reviewed', createdAt: '2026-10-01T00:00:00Z', blockers: []};
function setup() {
  const service = {reviewPendingProfile: vi.fn().mockResolvedValue(review), deleteReviewedPendingProfile: vi.fn().mockResolvedValue(undefined),
    listUsers: vi.fn().mockResolvedValue([]), updateUser: vi.fn(), enqueueUser: vi.fn(),
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}), listRuns: vi.fn().mockResolvedValue([]),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([]), listModerationReports: vi.fn().mockResolvedValue([])};
  const component = new AdminComponent(service as unknown as AdminService, {} as Router);
  component.users = [{...user}]; return {component, service};
}
afterEach(() => vi.restoreAllMocks());
async function eligible(component: ReturnType<typeof setup>['component']) {
  const action = component.reviewIncompleteProfile(component.users[0]);
  await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
  return {action};
}
describe('reviewed deletion confirmation and read-only recovery', () => {
  it('waits for explicit confirmation and snapshots reviewed identity while eligible', async () => {
    const {component, service} = setup();
    const {action} = await eligible(component);
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    component.users[0].spotifyId = 'pending:later-local-draft';
    component.confirmPendingProfileDeletion(); component.confirmPendingProfileDeletion(); await action;
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledExactlyOnceWith(user.userId, review.spotifyId);
  });
  it('Cancel during a held review ignores the late eligible response and permits a fresh review', async () => {
    const {component, service} = setup(), read = held<typeof review>(); service.reviewPendingProfile.mockReturnValueOnce(read.promise);
    const action = component.reviewIncompleteProfile(component.users[0]);
    expect(component.pendingProfileReview?.phase).toBe('reviewing');
    component.dismissPendingProfileReview(); read.resolve(review); await action;
    expect(component.pendingProfileReview).toBeNull(); expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    const next = await eligible(component); component.dismissPendingProfileReview(); await next.action;
    expect(service.reviewPendingProfile).toHaveBeenCalledTimes(2);
  });
  it('removes acknowledged deleted row immediately and recovers failed inventory without another delete', async () => {
    const {component, service} = setup(), read = held<AdminUserSyncSettings[]>();
    const other = {...user, userId: 'other-user', spotifyId: 'other-user', timezone: 'Europe/London'};
    component.users.push(other); service.listUsers.mockReturnValueOnce(read.promise);
    const {action} = await eligible(component); component.confirmPendingProfileDeletion();
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledOnce());
    expect(component.users).toEqual([other]);
    read.reject(new Error('Synthetic private read interruption')); await action;
    expect(component.pendingProfileReview?.phase).toBe('deleted-read-error');
    expect(component.successMessage).toContain('deleted'); expect(component.isUserBusy(user.userId)).toBe(true);
    service.listUsers.mockResolvedValue([{...other, timezone: 'UTC'}]);
    await component.reconcilePendingProfileDeletion();
    expect(component.users[0].timezone).toBe('Europe/London');
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
    expect(component.isUserBusy(user.userId)).toBe(false);
  });
  it('treats delete transport failure as uncertain and blocks every user mutation until read-only reconciliation', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic transport interruption'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    expect(component.pendingProfileReview?.phase).toBe('delete-error');
    component.dismissPendingProfileReview(); expect(component.pendingProfileReview).toBeNull();
    expect(component.isUserBusy(user.userId)).toBe(true);
    await component.saveUser(component.users[0]); await component.runUserNow(component.users[0]); await component.reviewIncompleteProfile(component.users[0]);
    expect(service.updateUser).not.toHaveBeenCalled(); expect(service.enqueueUser).not.toHaveBeenCalled();
    expect(service.reviewPendingProfile).toHaveBeenCalledTimes(1);
    service.listUsers.mockResolvedValue([{...user, spotifyId: 'verified-new-identity'}]); await component.load();
    expect(component.users[0].spotifyId).toBe('verified-new-identity'); expect(component.isUserBusy(user.userId)).toBe(false);
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });
  it('Cancel while eligible resolves the pending confirmation without writes or inventory reads', async () => {
    const {component, service} = setup(); const {action} = await eligible(component);
    component.dismissPendingProfileReview(); await action;
    expect(component.pendingProfileReview).toBeNull(); expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    expect(service.listUsers).not.toHaveBeenCalled(); expect(component.isUserBusy(user.userId)).toBe(false);
  });
  it.each(['', 'verified-spotify-id', 'pending:', 'pending:unsafe identity'])('fails closed for malformed reviewed identity %j', async spotifyId => {
    const {component, service} = setup(); service.reviewPendingProfile.mockResolvedValue({...review, spotifyId});
    await component.reviewIncompleteProfile(component.users[0]);
    expect(component.pendingProfileReview?.phase).toBe('review-error');
    component.confirmPendingProfileDeletion(); expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
  });
  it('requires a fresh review after read-only reconciliation finds a changed identity', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic uncertain delete'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    service.listUsers.mockResolvedValue([{...user, spotifyId: 'verified-new-identity'}]);
    await component.reconcilePendingProfileDeletion();
    expect(component.pendingProfileReview).toBeNull(); expect(component.users[0].spotifyId).toBe('verified-new-identity');
    expect(component.isUserBusy(user.userId)).toBe(false); component.confirmPendingProfileDeletion();
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });
  it('reports absent registration after uncertain delete without falsely claiming confirmed deletion', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic uncertain delete'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    await component.reconcilePendingProfileDeletion();
    expect(component.successMessage).toBe('The registration is no longer listed.');
    expect(component.users).toEqual([]); expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });
  it('keeps read-only reconciliation single-flight and retains mutation lock through repeated read errors', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic uncertain delete'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const recovery = component.reconcilePendingProfileDeletion(); await component.reconcilePendingProfileDeletion();
    expect(component.pendingProfileReview?.phase).toBe('reconciling');
    component.dismissPendingProfileReview(); expect(component.pendingProfileReview?.phase).toBe('reconciling');
    expect(service.listUsers).toHaveBeenCalledOnce(); read.reject(new Error('Synthetic repeated read failure')); await recovery;
    expect(component.pendingProfileReview?.phase).toBe('delete-error'); expect(component.isUserBusy(user.userId)).toBe(true);
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });
  it.each(['destroy', 'full refresh'])('settles eligible confirmation safely on %s', async transition => {
    const {component, service} = setup(); const {action} = await eligible(component);
    if (transition === 'destroy') component.ngOnDestroy(); else await component.load();
    await action; component.confirmPendingProfileDeletion();
    expect(component.pendingProfileReview).toBeNull(); expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
  });
  it('keeps uncertain in-flight delete locked when a newer full refresh completes before the response', async () => {
    const {component, service} = setup(), write = held<void>(); service.deleteReviewedPendingProfile.mockReturnValueOnce(write.promise);
    const {action} = await eligible(component); component.confirmPendingProfileDeletion();
    await vi.waitFor(() => expect(service.deleteReviewedPendingProfile).toHaveBeenCalledOnce());
    service.listUsers.mockResolvedValue([{...user}]); await component.load();
    expect(component.pendingProfileReview).toBeNull(); expect(component.isUserBusy(user.userId)).toBe(true);
    write.reject(new Error('Synthetic late uncertain response')); await action;
    expect(component.isUserBusy(user.userId)).toBe(true); expect(component.pendingProfileReview).toBeNull();
    await component.load(); expect(component.isUserBusy(user.userId)).toBe(false);
  });

  it('fails closed for nonliteral eligibility and contradictory linked-data blockers', async () => {
    const {component, service} = setup();
    service.reviewPendingProfile.mockResolvedValueOnce({...review, eligible: 'true' as unknown as boolean});
    await component.reviewIncompleteProfile(component.users[0]);
    expect(component.pendingProfileReview?.phase).toBe('blocked'); component.confirmPendingProfileDeletion();
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled(); component.dismissPendingProfileReview();
    service.reviewPendingProfile.mockResolvedValueOnce({...review, blockers: ['Synthetic linked record.']});
    await component.reviewIncompleteProfile(component.users[0]);
    expect(component.pendingProfileReview?.phase).toBe('review-error'); component.confirmPendingProfileDeletion();
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
  });
  it('retries failed review once and requires explicit fresh confirmation', async () => {
    const {component, service} = setup(); service.reviewPendingProfile.mockRejectedValueOnce(new Error('Synthetic review interruption'));
    await component.reviewIncompleteProfile(component.users[0]); expect(component.pendingProfileReview?.phase).toBe('review-error');
    const read = held<typeof review>(); service.reviewPendingProfile.mockReturnValueOnce(read.promise);
    const retry = component.retryPendingProfileReview(); await component.retryPendingProfileReview();
    expect(service.reviewPendingProfile).toHaveBeenCalledTimes(2); read.resolve(review);
    await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled(); component.dismissPendingProfileReview(); await retry;
  });
  it('does not release a fresh review when an older cancelled review finishes', async () => {
    const {component, service} = setup(), old = held<typeof review>(), fresh = held<typeof review>();
    service.reviewPendingProfile.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = component.reviewIncompleteProfile(component.users[0]); component.dismissPendingProfileReview();
    const second = component.reviewIncompleteProfile(component.users[0]); old.resolve(review); await first;
    expect(component.pendingProfileReview?.phase).toBe('reviewing'); expect(component.isUserBusy(user.userId)).toBe(true);
    fresh.resolve(review); await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    component.dismissPendingProfileReview(); await second; expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
  });
  it('does not clear uncertain deletion protection when full dashboard Refresh fails', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic uncertain deletion'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    service.listUsers.mockRejectedValueOnce(new Error('Synthetic full Refresh interruption')); await component.load();
    expect(component.pendingProfileReview).toBeNull(); expect(component.isUserBusy(user.userId)).toBe(true);
    expect(component.errorMessage).toBe('Synthetic full Refresh interruption');
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });
  it('does not reopen a dialog or publish stale reconciliation after a newer full Refresh', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic uncertain deletion'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const recovering = component.reconcilePendingProfileDeletion();
    service.listUsers.mockResolvedValueOnce([{...user, spotifyId: 'verified-new-identity'}]); await component.load();
    old.resolve([{...user}]); await recovering;
    expect(component.pendingProfileReview).toBeNull(); expect(component.users[0].spotifyId).toBe('verified-new-identity');
    expect(component.isUserBusy(user.userId)).toBe(false); expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });

  it('closing uncertain deletion explains the Administration Refresh recovery without claiming the registration was kept', async () => {
    const {component, service} = setup(); service.deleteReviewedPendingProfile.mockRejectedValueOnce(new Error('Synthetic transport interruption'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    component.dismissPendingProfileReview();
    expect(component.errorMessage).toContain('deletion result is uncertain');
    expect(component.errorMessage).toContain('Administration Refresh');
    expect(component.errorMessage).toContain('before taking another action');
    expect(component.errorMessage).toContain('Synthetic transport interruption');
    expect(component.errorMessage).not.toContain('was kept'); expect(component.isUserBusy(user.userId)).toBe(true);
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });
  it('closing confirmed deletion with failed readback preserves success and explains read-only Administration Refresh', async () => {
    const {component, service} = setup(); service.listUsers.mockRejectedValueOnce(new Error('Synthetic inventory interruption'));
    const {action} = await eligible(component); component.confirmPendingProfileDeletion(); await action;
    component.dismissPendingProfileReview();
    expect(component.successMessage).toContain('deleted'); expect(component.errorMessage).toContain('Deletion was confirmed');
    expect(component.errorMessage).toContain('Administration Refresh'); expect(component.errorMessage).toContain('without deleting again');
    expect(component.errorMessage).toContain('Synthetic inventory interruption'); expect(component.isUserBusy(user.userId)).toBe(true);
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledTimes(1);
  });

  it('normalizes missing review timestamp without inventing a date or bypassing explicit confirmation', async () => {
    const {component, service} = setup(); service.reviewPendingProfile.mockResolvedValueOnce({...review, createdAt: undefined as unknown as string});
    const {action} = await eligible(component); expect(component.pendingProfileReview?.createdAt).toBe('');
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled(); component.dismissPendingProfileReview(); await action;
  });

});
