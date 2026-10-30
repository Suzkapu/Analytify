import {afterEach, describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminUserSyncSettings, PendingProfileReview} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}
function user(id = 'synthetic-pending'): AdminUserSyncSettings {
  return {userId: id, spotifyId: `pending:${id}`, displayName: id, profilePicUrl: '', backupActive: false,
    hasRefreshToken: false, enabled: true, timezone: 'UTC', historyEnabled: true, historyIntervalMinutes: 60,
    historyIntervalUnit: 'minutes', shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days', longTermEnabled: false,
    longTermIntervalHours: 7, longTermIntervalUnit: 'days', songLeaguePlaylistsEnabled: false,
    songLeaguePlaylistFridaysOnly: true, songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: false, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastSuccessAt: null, lastError: null, requiredTasks: {}};
}
function setup() {
  const service = {
    updateUser: vi.fn().mockResolvedValue(undefined), listUsers: vi.fn().mockResolvedValue([]),
    enqueueUser: vi.fn().mockResolvedValue(1), listRuns: vi.fn().mockResolvedValue([]),
    reviewPendingProfile: vi.fn().mockResolvedValue({eligible: false, spotifyId: '', createdAt: '', blockers: ['Synthetic review blocked.']}),
    deleteReviewedPendingProfile: vi.fn().mockResolvedValue(undefined)
  };
  const component = new AdminComponent(service as unknown as AdminService, {} as Router);
  return {component, service};
}
afterEach(() => vi.restoreAllMocks());

// Desired safety regressions: overlapping same-user effects are defects, never characterized as accepted behavior.
describe('pending-registration review shares the user mutation lifetime', () => {
  for (const stage of ['review', 'delete', 'inventory readback'] as const) {
    for (const operation of ['save', 'run'] as const) {
      it(`blocks same-user ${operation} through pending ${stage}`, async () => {
        const {component, service} = setup(), pending = user(); component.users = [pending];
        const review = held<PendingProfileReview>(), deleted = held<void>(), inventory = held<AdminUserSyncSettings[]>();
        service.reviewPendingProfile.mockReturnValueOnce(review.promise);
        service.deleteReviewedPendingProfile.mockReturnValueOnce(deleted.promise);
        service.listUsers.mockReturnValueOnce(inventory.promise);
        const action = component.reviewIncompleteProfile(pending);
        const eligible = {eligible: true, spotifyId: 'pending:server-reviewed', createdAt: '2026-10-01T00:00:00Z', blockers: []};
        if (stage !== 'review') {
          review.resolve(eligible);
          await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
          component.confirmPendingProfileDeletion();
          await vi.waitFor(() => expect(service.deleteReviewedPendingProfile).toHaveBeenCalledOnce());
        }
        if (stage === 'inventory readback') {
          deleted.resolve();
          await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledOnce());
        }
        // Start the attempted effect synchronously; observe whether its service boundary was crossed.
        const overlapping = operation === 'save' ? component.saveUser(pending) : component.runUserNow(pending);
        const writes = service.updateUser.mock.calls.length, queues = service.enqueueUser.mock.calls.length;
        review.resolve(eligible);
        if (stage === 'review') {
          await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
          component.confirmPendingProfileDeletion();
        }
        deleted.resolve(); inventory.resolve([]);
        await Promise.all([action, overlapping]);
        expect(writes, 'Save must not cross the service boundary while this user is being reviewed/deleted').toBe(0);
        expect(queues, 'Run must not cross the service boundary while this user is being reviewed/deleted').toBe(0);
        expect(service.deleteReviewedPendingProfile).toHaveBeenCalledExactlyOnceWith(pending.userId, eligible.spotifyId);
        expect(component.reviewingUsers.has(pending.userId)).toBe(false);
        expect(component.isUserBusy(pending.userId)).toBe(false);
      });
    }
  }

  for (const operation of ['save', 'run'] as const) {
    for (const stage of ['write', 'dependent readback'] as const) {
      it(`blocks review while same-user ${operation} awaits ${stage}`, async () => {
        const {component, service} = setup(), pending = user(); component.users = [pending];
        const write = held<void>(), queued = held<number>(), inventory = held<AdminUserSyncSettings[]>(), runs = held<never[]>();
        service.updateUser.mockReturnValueOnce(write.promise); service.enqueueUser.mockReturnValueOnce(queued.promise);
        service.listUsers.mockReturnValueOnce(inventory.promise); service.listRuns.mockReturnValueOnce(runs.promise);
        const action = operation === 'save' ? component.saveUser(pending) : component.runUserNow(pending);
        if (stage === 'dependent readback') {
          write.resolve(); queued.resolve(1);
          await vi.waitFor(() => expect(operation === 'save' ? service.listUsers : service.listRuns).toHaveBeenCalledOnce());
        }
        await component.reviewIncompleteProfile(pending);
        const reviews = service.reviewPendingProfile.mock.calls.length;
        write.resolve(); queued.resolve(1); inventory.resolve([]); runs.resolve([]); await action;
        expect(reviews, 'Review must not start while the same user mutation/readback owns its lifetime').toBe(0);
        expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
        expect(component.isUserBusy(pending.userId)).toBe(false);
      });
    }
  }

  it('keeps other users Save and Run independent while one pending registration is under review', async () => {
    const {component, service} = setup(), pending = user(), saved = user('synthetic-save'), queued = user('synthetic-run');
    saved.spotifyId = 'synthetic-save'; queued.spotifyId = 'synthetic-run';
    saved.backupActive = queued.backupActive = true; saved.hasRefreshToken = queued.hasRefreshToken = true;
    component.users = [pending, saved, queued];
    const review = held<PendingProfileReview>(); service.reviewPendingProfile.mockReturnValueOnce(review.promise);
    service.listUsers.mockResolvedValue([pending, saved, queued]);
    const action = component.reviewIncompleteProfile(pending);
    await component.saveUser(saved); await component.runUserNow(queued);
    expect(component.reviewingUsers.has(pending.userId)).toBe(true);
    expect(service.updateUser).toHaveBeenCalledExactlyOnceWith(saved);
    expect(service.enqueueUser).toHaveBeenCalledExactlyOnceWith(queued);
    review.resolve({eligible: false, spotifyId: pending.spotifyId, createdAt: '', blockers: ['Synthetic linked data.']}); await action;
    expect(service.deleteReviewedPendingProfile).not.toHaveBeenCalled();
    expect(component.reviewingUsers.size).toBe(0);
    expect(component.isUserBusy(saved.userId)).toBe(false); expect(component.isUserBusy(queued.userId)).toBe(false);
  });
});
