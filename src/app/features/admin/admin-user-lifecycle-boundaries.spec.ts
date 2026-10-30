import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AdminService} from '@core/admin/admin.service';
import {AdminSyncRun, AdminUserSyncSettings} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function user(id: string, timezone = 'UTC'): AdminUserSyncSettings {
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
async function setup() {
  const service = {
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}),
    listUsers: vi.fn().mockResolvedValue([]), listRuns: vi.fn().mockResolvedValue([]),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([]), listModerationReports: vi.fn().mockResolvedValue([]),
    updateUser: vi.fn().mockResolvedValue(undefined), enqueueUser: vi.fn().mockResolvedValue(1)
  };
  await TestBed.configureTestingModule({declarations: [AdminComponent], providers: [
    {provide: AdminService, useValue: service}, {provide: Router, useValue: {navigate: vi.fn()}}
  ]}).overrideComponent(AdminComponent, {set: {template: ''}}).compileComponents();
  const fixture = TestBed.createComponent(AdminComponent);
  return {component: fixture.componentInstance, fixture, service};
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

describe('administration user inventory lifecycle boundaries', () => {
  it('preserves another user unsaved draft when one user save reads back the inventory', async () => {
    const {component, service} = await setup();
    const alice = user('Alice');
    const bob = user('Bob', 'Europe/Vienna');
    component.users = [alice, bob];
    service.listUsers.mockResolvedValue([user('Alice', 'Europe/London'), user('Bob')]);
    await component.saveUser(alice);
    expect(component.users.find(value => value.userId === 'Alice')?.timezone).toBe('Europe/London');
    expect(component.users.find(value => value.userId === 'Bob')?.timezone).toBe('Europe/Vienna');
    expect(service.updateUser).toHaveBeenCalledExactlyOnceWith(alice);
  });

  it.each([
    ['timezone', 'Europe/Vienna', 'Europe/London'],
    ['enabled', true, false],
    ['historyIntervalMinutes', 30, 90],
    ['shortTermEnabled', true, false],
    ['sharedPlaylistIntervalUnit', 'hours', 'days'],
    ['songLeaguePlaylistFridaysOnly', true, false]
  ] as const)('keeps a newer unsaved %s edit after the activated save reads back', async (field, before, after) => {
    const {component, service} = await setup();
    const draft = {...user('Alice'), [field]: before};
    component.users = [draft];
    const writing = held<void>(); service.updateUser.mockReturnValueOnce(writing.promise);
    const saving = component.saveUser(draft);
    Object.assign(draft, {[field]: after});
    service.listUsers.mockResolvedValue([{...user('Alice'), [field]: before, displayName: 'Updated server profile',
      backupActive: false, lastError: 'Reconnect needed', requiredTasks: {shared_playlists: 'Shared snapshot'}}]);
    writing.resolve(); await saving;
    expect(service.updateUser.mock.calls[0][0][field]).toBe(before);
    expect(component.users[0][field]).toBe(after);
    expect(component.users[0]).toMatchObject({displayName: 'Updated server profile', backupActive: false,
      lastError: 'Reconnect needed', requiredTasks: {shared_playlists: 'Shared snapshot'}});
    expect(component.savingUsers.has('Alice')).toBe(false);
  });

  it('retains edits made during held readback while accepting untouched server schedule fields', async () => {
    const {component, service} = await setup();
    const draft = {...user('Alice'), historyEnabled: false, historyIntervalMinutes: 60};
    component.users = [draft];
    const reading = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(reading.promise);
    const saving = component.saveUser(draft);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledOnce());
    draft.timezone = 'Europe/London';
    reading.resolve([{...user('Alice'), historyEnabled: true, historyIntervalMinutes: 120}]); await saving;
    expect(component.users[0]).toMatchObject({timezone: 'Europe/London', historyEnabled: true, historyIntervalMinutes: 120});
    expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it('keeps the edited draft and reports write rejection without starting a private readback', async () => {
    const {component, service} = await setup();
    const draft = user('Alice', 'Europe/Vienna'); component.users = [draft];
    const writing = held<void>(); service.updateUser.mockReturnValueOnce(writing.promise);
    const saving = component.saveUser(draft); draft.timezone = 'Europe/London';
    writing.reject(new Error('Save denied')); await saving;
    expect(component.users[0].timezone).toBe('Europe/London');
    expect(component.errorMessage).toBe('Save denied');
    expect(service.listUsers).not.toHaveBeenCalled();
    expect(component.isUserBusy('Alice')).toBe(false);
  });

  it('allows independent user writes and holds each busy state until its own readback finishes', async () => {
    const {component, service} = await setup();
    const alice = user('Alice'); const bob = user('Bob');
    component.users = [alice, bob];
    const a = held<void>(); const b = held<void>();
    service.updateUser.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = component.saveUser(alice); const second = component.saveUser(bob);
    await component.saveUser(alice);
    expect(service.updateUser).toHaveBeenCalledTimes(2);
    expect(component.isUserBusy('Alice')).toBe(true);
    expect(component.isUserBusy('Bob')).toBe(true);
    service.listUsers.mockResolvedValue([alice, bob]);
    b.resolve(); await second;
    expect(component.isUserBusy('Bob')).toBe(false);
    expect(component.isUserBusy('Alice')).toBe(true);
    a.resolve(); await first;
    expect(component.isUserBusy('Alice')).toBe(false);
  });

  it('does not replace a newer dashboard refresh with an earlier held load', async () => {
    const {component, service} = await setup();
    const old = held<AdminUserSyncSettings[]>();
    service.listUsers.mockReturnValueOnce(old.promise).mockResolvedValueOnce([user('New inventory')]);
    const earlier = component.load();
    await component.load();
    old.resolve([user('Old inventory')]); await earlier;
    expect(component.users.map(value => value.userId)).toEqual(['New inventory']);
    expect(component.isLoading).toBe(false);
  });

  it('keeps a saved user readback when an older dashboard load completes afterwards', async () => {
    const {component, service} = await setup();
    const alice = user('Alice', 'Europe/Vienna');
    component.users = [alice];
    const old = held<AdminUserSyncSettings[]>();
    service.listUsers.mockReturnValueOnce(old.promise).mockResolvedValueOnce([alice]);
    const initial = component.load();
    await component.saveUser(alice);
    old.resolve([user('Alice')]); await initial;
    expect(component.users[0].timezone).toBe('Europe/Vienna');
  });

  it('does not publish private dashboard reads after route destruction', async () => {
    const {component, fixture, service} = await setup();
    const privateUsers = held<AdminUserSyncSettings[]>();
    service.listUsers.mockReturnValueOnce(privateUsers.promise);
    const loading = component.load();
    fixture.destroy();
    privateUsers.resolve([user('Private user')]); await loading;
    expect(component.users).toEqual([]);
    expect(component.successMessage).toBe('');
    expect(component.errorMessage).toBe('');
  });

  it('does not start a private user readback after a held mutation outlives its route', async () => {
    const {component, fixture, service} = await setup();
    const saving = held<void>();
    service.updateUser.mockReturnValueOnce(saving.promise);
    const operation = component.saveUser(user('Alice'));
    fixture.destroy(); saving.resolve(); await operation;
    expect(service.listUsers).not.toHaveBeenCalled();
    expect(component.successMessage).toBe('');
  });

  it('does not publish late run inventory after route destruction', async () => {
    const {component, fixture, service} = await setup();
    const runs = held<AdminSyncRun[]>();
    service.listRuns.mockReturnValueOnce(runs.promise);
    const refresh = component.refreshRuns();
    fixture.destroy(); runs.resolve([{id: 'private-run'} as AdminSyncRun]); await refresh;
    expect(component.runs).toEqual([]);
  });

  it('suppresses a private load rejection after route destruction', async () => {
    const {component, fixture, service} = await setup();
    const users = held<AdminUserSyncSettings[]>();
    service.listUsers.mockReturnValueOnce(users.promise);
    const loading = component.load();
    fixture.destroy(); users.reject(new Error('Private inventory unavailable')); await loading;
    expect(component.errorMessage).toBe('');
    expect(component.users).toEqual([]);
  });

  it('suppresses a held user save rejection after route destruction', async () => {
    const {component, fixture, service} = await setup();
    const write = held<void>();
    service.updateUser.mockReturnValueOnce(write.promise);
    const saving = component.saveUser(user('Alice'));
    fixture.destroy(); write.reject(new Error('Private user update denied')); await saving;
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toBe('');
    expect(service.listUsers).not.toHaveBeenCalled();
  });

  it('does not publish an old run refresh rejection after a newer full load succeeds', async () => {
    const {component, service} = await setup();
    const oldRuns = held<AdminSyncRun[]>();
    service.listRuns.mockReturnValueOnce(oldRuns.promise).mockResolvedValueOnce([{id: 'current-run'} as AdminSyncRun]);
    const oldRefresh = component.refreshRuns();
    await component.load();
    oldRuns.reject(new Error('Outdated request failed')); await oldRefresh;
    expect(component.errorMessage).toBe('');
    expect(component.runs.map(run => run.id)).toEqual(['current-run']);
  });

  it('does not replace current runs with an older held run refresh', async () => {
    const {component, service} = await setup();
    const oldRuns = held<AdminSyncRun[]>();
    service.listRuns.mockReturnValueOnce(oldRuns.promise).mockResolvedValueOnce([{id: 'current-run'} as AdminSyncRun]);
    const oldRefresh = component.refreshRuns();
    await component.load();
    oldRuns.resolve([{id: 'outdated-run'} as AdminSyncRun]); await oldRefresh;
    expect(component.runs.map(run => run.id)).toEqual(['current-run']);
  });

  it('does not replace newer explicitly loaded users with a held save readback', async () => {
    const {component, service} = await setup();
    const oldReadback = held<AdminUserSyncSettings[]>();
    service.listUsers.mockReturnValueOnce(oldReadback.promise).mockResolvedValueOnce([user('Alice', 'Europe/Vienna')]);
    const saving = component.saveUser(user('Alice'));
    await Promise.resolve(); await Promise.resolve();
    expect(service.listUsers).toHaveBeenCalledTimes(1);
    await component.load();
    oldReadback.resolve([user('Alice', 'UTC')]); await saving;
    expect(component.users[0].timezone).toBe('Europe/Vienna');
  });

});
