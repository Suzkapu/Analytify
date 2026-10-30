import {describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminUserSyncSettings, SyncSchedulePolicy} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';
import {AdminUserScheduleDraft} from './admin-user-interval-validation';

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}
function user(id = 'Alice'): AdminUserSyncSettings {
  return {userId: id, spotifyId: id, displayName: id, profilePicUrl: '', backupActive: true,
    hasRefreshToken: true, enabled: true, timezone: 'UTC', historyEnabled: true,
    historyIntervalMinutes: 60, historyIntervalUnit: 'minutes', shortTermEnabled: false,
    shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours', mediumTermEnabled: false,
    mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days', longTermEnabled: false,
    longTermIntervalHours: 7, longTermIntervalUnit: 'days', songLeaguePlaylistsEnabled: false,
    songLeaguePlaylistFridaysOnly: true, songLeaguePlaylistIntervalMinutes: 60,
    songLeaguePlaylistIntervalUnit: 'minutes', sharedPlaylistsEnabled: false,
    sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastError: null, lastSuccessAt: null, requiredTasks: {stats_short_term: 'Required by an active Song League.'}};
}
const policy: SyncSchedulePolicy = {taskKey: 'listening_history', available: true, intervalValue: 60, intervalUnit: 'minutes'};
async function setup() {
  const service = {
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}),
    listUsers: vi.fn().mockResolvedValue([user(), user('Bob')]), listRuns: vi.fn().mockResolvedValue([]),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([policy]), listModerationReports: vi.fn().mockResolvedValue([]),
    updateSyncSchedulePolicy: vi.fn().mockResolvedValue(undefined), updateUser: vi.fn().mockResolvedValue(undefined),
    enqueueUser: vi.fn().mockResolvedValue(2)
  };
  const component = new AdminComponent(service as unknown as AdminService, {} as Router);
  await component.load();
  service.listUsers.mockClear();
  return {component, service};
}

describe('user interval draft validation at mutation boundaries', () => {
  it('retains a blank draft and rejects Save without invalidating an already pending dashboard read', async () => {
    const {component, service} = await setup();
    component.users[0].historyIntervalMinutes = null;
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const loading = component.load();
    await component.saveUser(component.users[0]);
    expect(component.userSaveStates.get('Alice')).toBe('validation');
    expect(service.updateUser).not.toHaveBeenCalled();
    expect(service.listUsers).toHaveBeenCalledOnce();
    expect(component.isUserBusy('Alice')).toBe(false);
    read.resolve([{...user(), displayName: 'Fresh server identity'}, user('Bob')]); await loading;
    expect(component.users[0]).toMatchObject({displayName: 'Fresh server identity', historyIntervalMinutes: null});
    expect(component.isLoading).toBe(false);
  });

  it.each([
    ['history zero', {historyIntervalMinutes: 0}],
    ['short-term negative', {shortTermIntervalHours: -1}],
    ['medium-term fraction', {mediumTermIntervalHours: 1.5}],
    ['long-term nonfinite', {longTermIntervalHours: Infinity}],
    ['League excessive', {songLeaguePlaylistIntervalMinutes: 10081}],
    ['shared blank', {sharedPlaylistIntervalMinutes: null}]
  ] satisfies [string, Partial<AdminUserScheduleDraft>][])(
    'rejects %s without starting writes or dependent reads', async (_description, invalid) => {
      const {component, service} = await setup();
      Object.assign(component.users[0], invalid);
      await component.saveUser(component.users[0]);
      expect(component.userSaveStates.get('Alice')).toBe('validation');
      expect(service.updateUser).not.toHaveBeenCalled();
      expect(service.listUsers).not.toHaveBeenCalled();
      expect(component.users[0]).toMatchObject(invalid);
    }
  );

  it('accepts a corrected value and preserves another user’s independent unsaved draft', async () => {
    const {component, service} = await setup();
    component.users[0].historyIntervalMinutes = null;
    component.users[1].sharedPlaylistIntervalMinutes = null;
    await component.saveUser(component.users[0]);
    component.users[0].historyIntervalMinutes = 120;
    service.listUsers.mockResolvedValue([{...user(), historyIntervalMinutes: 120}, user('Bob')]);
    await component.saveUser(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledOnce();
    expect(service.updateUser.mock.calls[0][0]).toMatchObject({userId: 'Alice', historyIntervalMinutes: 120});
    expect(component.userSaveStates.get('Alice')).toBe('saved');
    expect(component.users[1].sharedPlaylistIntervalMinutes).toBeNull();
  });

  it('recovers an acknowledged save by reading despite a later blank draft, without another write', async () => {
    const {component, service} = await setup();
    service.listUsers.mockRejectedValueOnce(new Error('Synthetic read interruption'));
    await component.saveUser(component.users[0]);
    expect(component.userSaveStates.get('Alice')).toBe('read-error');
    component.users[0].historyIntervalMinutes = null;
    await component.saveUser(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledOnce();
    expect(service.listUsers).toHaveBeenCalledTimes(2);
    expect(component.users[0].historyIntervalMinutes).toBeNull();
    expect(component.userSaveStates.get('Alice')).toBe('newer-draft');
    expect(component.userReadbackRequired.has('Alice')).toBe(false);
  });

  it('preserves a blank user draft through unrelated policy save and fresh server metadata', async () => {
    const {component, service} = await setup();
    component.users[0].longTermIntervalHours = null;
    service.listUsers.mockResolvedValue([{...user(), backupActive: false}, user('Bob')]);
    await component.saveSchedulePolicy(policy);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledOnce();
    expect(service.updateUser).not.toHaveBeenCalled();
    expect(component.users[0]).toMatchObject({longTermIntervalHours: null, backupActive: false});
  });

  it('allows manual enqueue of selected and required tasks without saving a blank numeric draft', async () => {
    const {component, service} = await setup();
    component.users[0].historyIntervalMinutes = null;
    await component.runUserNow(component.users[0]);
    expect(service.enqueueUser).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      userId: 'Alice', historyEnabled: true, historyIntervalMinutes: null,
      requiredTasks: {stats_short_term: 'Required by an active Song League.'}
    }));
    expect(service.updateUser).not.toHaveBeenCalled();
    expect(service.listRuns).toHaveBeenCalledTimes(2);
    expect(component.users[0].historyIntervalMinutes).toBeNull();
    expect(component.successMessage).toContain('2 tasks queued');
  });
});
