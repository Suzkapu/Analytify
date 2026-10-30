import {describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminUserSyncSettings} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function user(id = 'Alice', timezone = 'UTC'): AdminUserSyncSettings {
  return {userId: id, spotifyId: id, displayName: id,
    profilePicUrl: '', backupActive: true, hasRefreshToken: true, enabled: true, timezone,
    historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
    shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days',
    longTermEnabled: false, longTermIntervalHours: 7, longTermIntervalUnit: 'days',
    songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
    songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: false, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastSuccessAt: null, lastError: null, requiredTasks: {}};
}
function setup() {
  const service = {updateUser: vi.fn().mockResolvedValue(undefined), listUsers: vi.fn().mockResolvedValue([user()]),
    listRuns: vi.fn().mockResolvedValue([]), enqueueUser: vi.fn().mockResolvedValue(1),
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([]), listModerationReports: vi.fn().mockResolvedValue([])};
  const component = new AdminComponent(service as unknown as AdminService, {} as Router);
  component.users = [user(), user('Bob')];
  return {component, service};
}

describe('per-user save acknowledgement and read-only recovery', () => {
  it('reports an acknowledged write separately and refreshes without submitting it twice', async () => {
    const {component, service} = setup();
    service.listUsers.mockRejectedValueOnce(new Error('Synthetic read interruption'));
    await component.saveUser(component.users[0]);
    expect(component.userSaveStates.get('Alice')).toBe('read-error');
    expect(component.userReadbackRequired.has('Alice')).toBe(true);
    expect(component.errorMessage).toBe('Synthetic read interruption');
    component.users[0].timezone = 'Europe/London';
    await component.saveUser(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledOnce();
    expect(service.listUsers).toHaveBeenCalledTimes(2);
    expect(component.users[0].timezone).toBe('Europe/London');
    expect(component.userSaveStates.get('Alice')).toBe('newer-draft');
    expect(component.userReadbackRequired.has('Alice')).toBe(false);
  });

  it('holds only this user busy during recovery and prevents duplicate save, refresh and queue work', async () => {
    const {component, service} = setup();
    service.listUsers.mockRejectedValueOnce(new Error('Read failed'));
    await component.saveUser(component.users[0]);
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const recovery = component.refreshUserSettings(component.users[0]);
    expect(component.userSaveStates.get('Alice')).toBe('refreshing');
    expect(component.isUserBusy('Alice')).toBe(true); expect(component.isUserBusy('Bob')).toBe(false);
    await component.refreshUserSettings(component.users[0]); await component.saveUser(component.users[0]);
    await component.runUserNow(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledOnce(); expect(service.listUsers).toHaveBeenCalledTimes(2);
    expect(service.enqueueUser).not.toHaveBeenCalled();
    component.users[1].timezone = 'Europe/Vienna';
    read.resolve([user(), user('Bob')]); await recovery;
    expect(component.users[1].timezone).toBe('Europe/Vienna');
    expect(component.userSaveStates.get('Alice')).toBe('saved');
    expect(component.isUserBusy('Alice')).toBe(false);
  });

  it('keeps acknowledged recovery available through repeated read failure, then permits a new explicit save', async () => {
    const {component, service} = setup();
    service.listUsers.mockRejectedValueOnce(new Error('First read failed')).mockRejectedValueOnce(new Error('Retry failed'));
    await component.saveUser(component.users[0]); await component.refreshUserSettings(component.users[0]);
    expect(component.userReadbackRequired.has('Alice')).toBe(true);
    expect(component.userSaveStates.get('Alice')).toBe('read-error');
    expect(component.errorMessage).toBe('Retry failed'); expect(service.updateUser).toHaveBeenCalledOnce();
    await component.refreshUserSettings(component.users[0]);
    component.users[0].timezone = 'Europe/Paris';
    await component.saveUser(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledTimes(2);
    expect(service.updateUser.mock.calls[1][0].timezone).toBe('Europe/Paris');
  });

  it('distinguishes rejected writes from committed writes and keeps other user feedback independent', async () => {
    const {component, service} = setup();
    service.updateUser.mockRejectedValueOnce(new Error('Write denied'));
    await component.saveUser(component.users[0]);
    expect(component.userSaveStates.get('Alice')).toBe('save-error');
    expect(component.userReadbackRequired.has('Alice')).toBe(false);
    expect(service.listUsers).not.toHaveBeenCalled();
    await component.saveUser(component.users[1]);
    expect(component.userSaveStates.get('Alice')).toBe('save-error');
    expect(component.userSaveStates.get('Bob')).toBe('saved');
    expect(service.updateUser).toHaveBeenCalledTimes(2);
  });

  it('preserves edits made during the first readback and exposes the newer unsaved draft', async () => {
    const {component, service} = setup();
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const saving = component.saveUser(component.users[0]);
    expect(component.userSaveStates.get('Alice')).toBe('saving');
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledOnce());
    component.users[0].timezone = 'Europe/London';
    read.resolve([user()]); await saving;
    expect(component.userSaveStates.get('Alice')).toBe('newer-draft');
    expect(component.users[0].timezone).toBe('Europe/London');
  });

  it('does not label a later edit unsaved when it already matches the current server value', async () => {
    const {component, service} = setup();
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const saving = component.saveUser(component.users[0]);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledOnce());
    component.users[0].timezone = 'Europe/London';
    read.resolve([user('Alice', 'Europe/London')]); await saving;
    expect(component.users[0].timezone).toBe('Europe/London');
    expect(component.userSaveStates.get('Alice')).toBe('saved');
    expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it('retains genuinely unsaved changes when another edited field already matches the server', async () => {
    const {component, service} = setup();
    component.users[0].shortTermEnabled = false;
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const saving = component.saveUser(component.users[0]);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledOnce());
    component.users[0].timezone = 'Europe/London'; component.users[0].shortTermEnabled = true;
    read.resolve([{...user(), shortTermEnabled: true}]); await saving;
    expect(component.users[0]).toMatchObject({timezone: 'Europe/London', shortTermEnabled: true});
    expect(component.userSaveStates.get('Alice')).toBe('newer-draft');
    expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it('does not issue reads without an acknowledged save or after route destruction', async () => {
    const {component, service} = setup();
    await component.refreshUserSettings(component.users[0]);
    expect(service.listUsers).not.toHaveBeenCalled();
    service.listUsers.mockRejectedValueOnce(new Error('Initial read failed'));
    await component.saveUser(component.users[0]);
    component.ngOnDestroy();
    await component.refreshUserSettings(component.users[0]);
    expect(service.listUsers).toHaveBeenCalledOnce();
  });

  it('leaves read-only recovery available after an explicit dashboard refresh fails', async () => {
    const {component, service} = setup();
    service.listUsers.mockRejectedValueOnce(new Error('Saved read failed')).mockRejectedValueOnce(new Error('Dashboard read failed'));
    await component.saveUser(component.users[0]); await component.load();
    expect(component.userSaveStates.get('Alice')).toBe('read-error');
    expect(component.userReadbackRequired.has('Alice')).toBe(true);
    await component.saveUser(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledOnce();
    expect(component.userReadbackRequired.has('Alice')).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)('ignores an older recovery %s after a newer full dashboard load', async outcome => {
    const {component, service} = setup();
    service.listUsers.mockRejectedValueOnce(new Error('Initial read failed'));
    await component.saveUser(component.users[0]);
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const recovering = component.refreshUserSettings(component.users[0]);
    service.listUsers.mockResolvedValueOnce([user('Current inventory')]);
    await component.load();
    if (outcome === 'resolve') read.resolve([user('Stale replacement')]); else read.reject(new Error('Stale rejection'));
    await recovering;
    expect(component.users.map(value => value.userId)).toEqual(['Current inventory']);
    expect(component.userSaveStates.size).toBe(0);
    expect(component.userReadbackRequired.size).toBe(0);
    expect(component.errorMessage).toBe('');
    expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'] as const)('suppresses late recovery %s after route destruction', async outcome => {
    const {component, service} = setup();
    service.listUsers.mockRejectedValueOnce(new Error('Initial read failed'));
    await component.saveUser(component.users[0]);
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const recovering = component.refreshUserSettings(component.users[0]);
    const original = component.users;
    component.ngOnDestroy(); component.successMessage = ''; component.errorMessage = '';
    if (outcome === 'resolve') read.resolve([user('Private replacement')]); else read.reject(new Error('Late error'));
    await recovering;
    expect(component.users).toBe(original);
    expect(component.successMessage).toBe(''); expect(component.errorMessage).toBe('');
    expect(component.isUserBusy('Alice')).toBe(false);
    expect(service.updateUser).toHaveBeenCalledOnce();
  });
});
