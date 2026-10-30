import {afterEach, describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminUserSyncSettings, SyncSchedulePolicy} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function held<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
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
const history: SyncSchedulePolicy = {taskKey: 'listening_history', available: true, intervalValue: 60, intervalUnit: 'minutes'};
const stats: SyncSchedulePolicy = {taskKey: 'stats_short_term', available: true, intervalValue: 24, intervalUnit: 'hours'};
async function setup() {
  const initial = [user(), user('Bob')];
  const service = {
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}),
    listUsers: vi.fn().mockResolvedValue(initial), listRuns: vi.fn().mockResolvedValue([]),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([history, stats]), listModerationReports: vi.fn().mockResolvedValue([]),
    updateSyncSchedulePolicy: vi.fn().mockResolvedValue(undefined), updateUser: vi.fn().mockResolvedValue(undefined),
    reviewPendingProfile: vi.fn().mockResolvedValue({eligible: true, spotifyId: 'Alice', blockers: []}),
    deleteReviewedPendingProfile: vi.fn().mockResolvedValue(undefined)
  };
  const component = new AdminComponent(service as unknown as AdminService, {} as Router);
  await component.load();
  return {component, service, initial};
}

afterEach(() => vi.restoreAllMocks());

describe('independent user schedule drafts and server inventory ownership', () => {
  it('keeps edited values through policy readback while refreshing untouched fields and server metadata', async () => {
    const {component, service, initial} = await setup();
    component.users[0].timezone = 'Europe/London'; component.users[0].historyEnabled = false;
    service.listUsers.mockResolvedValue([{...user(), displayName: 'Fresh Alice', backupActive: false,
      hasRefreshToken: false, historyIntervalMinutes: 120, lastError: 'Reconnect needed',
      requiredTasks: {shared_playlists: 'Owned snapshot'}}, user('Bob', 'Europe/Vienna')]);
    await component.saveSchedulePolicy(history);
    expect(component.users[0]).toMatchObject({timezone: 'Europe/London', historyEnabled: false,
      historyIntervalMinutes: 120, displayName: 'Fresh Alice', backupActive: false, hasRefreshToken: false,
      lastError: 'Reconnect needed', requiredTasks: {shared_playlists: 'Owned snapshot'}});
    expect(component.users[1].timezone).toBe('Europe/Vienna');
    expect(initial[0]).toMatchObject({timezone: 'UTC', historyEnabled: true});
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('preserves every optional task choice through policy refresh and submits the complete activated schedule', async () => {
    const {component, service} = await setup();
    const choices: Partial<AdminUserSyncSettings> = {
      enabled: false, timezone: 'Europe/London', historyEnabled: false, historyIntervalMinutes: 2, historyIntervalUnit: 'hours',
      shortTermEnabled: false, shortTermIntervalHours: 2, shortTermIntervalUnit: 'days',
      mediumTermEnabled: true, mediumTermIntervalHours: 72, mediumTermIntervalUnit: 'hours',
      longTermEnabled: true, longTermIntervalHours: 3, longTermIntervalUnit: 'days',
      songLeaguePlaylistsEnabled: true, songLeaguePlaylistFridaysOnly: false,
      songLeaguePlaylistIntervalMinutes: 4, songLeaguePlaylistIntervalUnit: 'hours',
      sharedPlaylistsEnabled: true, sharedPlaylistIntervalMinutes: 180, sharedPlaylistIntervalUnit: 'minutes'
    };
    Object.assign(component.users[0], choices);
    const metadata = {displayName: 'Current Alice', hasRefreshToken: false,
      requiredTasks: {stats_short_term: 'Active league'}};
    service.listUsers.mockResolvedValueOnce([{...user(), ...metadata}, user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0]).toMatchObject({...choices, ...metadata});
    service.listUsers.mockResolvedValueOnce([{...user(), ...choices, ...metadata}, user('Bob')]);
    await component.saveUser(component.users[0]);
    expect(service.updateUser).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId: 'Alice', ...choices}));
    expect(component.users[0]).toMatchObject({...choices, ...metadata});
    expect(component.userSaveStates.get('Alice')).toBe('saved');
  });

  it('preserves both users drafts during an explicit dashboard refresh', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London'; component.users[1].shortTermEnabled = true;
    service.listUsers.mockResolvedValue([{...user(), displayName: 'Updated profile'}, {...user('Bob'), shortTermIntervalHours: 48}]);
    await component.load();
    expect(component.users[0]).toMatchObject({timezone: 'Europe/London', displayName: 'Updated profile'});
    expect(component.users[1]).toMatchObject({shortTermEnabled: true, shortTermIntervalHours: 48});
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it('includes edits made while an unrelated policy inventory read is pending', async () => {
    const {component, service} = await setup();
    const read = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(read.promise);
    const policySave = component.saveSchedulePolicy(history);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledTimes(2));
    component.users[0].timezone = 'Europe/Paris'; component.users[1].enabled = false;
    read.resolve([user(), user('Bob')]); await policySave;
    expect(component.users[0].timezone).toBe('Europe/Paris'); expect(component.users[1].enabled).toBe(false);
  });

  it('rebases untouched values on each fresh server read without keeping reverted edits dirty', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/Vienna'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('Europe/London');
    component.users[0].timezone = 'Europe/Vienna';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Asia/Tokyo'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('Asia/Tokyo');
  });

  it('rebases a successful user save before protecting subsequent edits from policy refresh', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    await component.saveUser(component.users[0]);
    component.users[0].timezone = 'Europe/Paris';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('Europe/Paris');
    component.users[0].timezone = 'Europe/London';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Asia/Tokyo'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('Asia/Tokyo');
    expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it('does not let an earlier policy read rewind a user save that finishes later', async () => {
    const {component, service} = await setup();
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const policySave = component.saveSchedulePolicy(history);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledTimes(2));
    component.users[0].timezone = 'Europe/London';
    service.listUsers.mockResolvedValueOnce([{...user('Alice', 'Europe/London'), displayName: 'Current profile'}, user('Bob')]);
    await component.saveUser(component.users[0]);
    old.resolve([user(), user('Bob')]); await policySave;
    expect(component.users[0]).toMatchObject({timezone: 'Europe/London', displayName: 'Current profile'});
    expect(component.userSaveStates.get('Alice')).toBe('saved');
  });

  it('does not accept an old policy snapshot begun while a user write was still pending', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    const write = held<void>(); service.updateUser.mockReturnValueOnce(write.promise);
    const saving = component.saveUser(component.users[0]);
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const policySave = component.saveSchedulePolicy(history);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledTimes(2));
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    write.resolve(); await saving;
    old.resolve([user(), user('Bob')]); await policySave;
    expect(component.users[0].timezone).toBe('Europe/London');
    expect(component.userSaveStates.get('Alice')).toBe('saved');
  });

  it('keeps all live edit choices while a write is pending, including a change back to the old baseline', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    const write = held<void>(); service.updateUser.mockReturnValueOnce(write.promise);
    const saving = component.saveUser(component.users[0]);
    component.users[0].timezone = 'UTC';
    service.listUsers.mockResolvedValueOnce([{...user('Alice', 'Europe/London'), shortTermIntervalHours: 48}, user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0]).toMatchObject({timezone: 'UTC', shortTermIntervalHours: 24});
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    write.resolve(); await saving;
    expect(component.users[0].timezone).toBe('UTC');
    expect(component.userSaveStates.get('Alice')).toBe('newer-draft');
  });

  it('keeps acknowledged readback recovery and later drafts through an unrelated successful inventory refresh', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    service.listUsers.mockRejectedValueOnce(new Error('Saved read interrupted'));
    await component.saveUser(component.users[0]);
    component.users[0].timezone = 'UTC';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('UTC');
    expect(component.userReadbackRequired.has('Alice')).toBe(true);
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    await component.refreshUserSettings(component.users[0]);
    expect(component.users[0].timezone).toBe('UTC'); expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it('removes an absent user and does not restore their old draft if they later reappear', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/Paris';
    service.listUsers.mockResolvedValueOnce([user('Bob')]); await component.load();
    expect(component.users.map(value => value.userId)).toEqual(['Bob']);
    service.listUsers.mockResolvedValueOnce([user(), user('Bob')]); await component.load();
    expect(component.users[0].timezone).toBe('UTC');
  });

  it('does not rewind newer server metadata when two independent policy reads finish in reverse order', async () => {
    const {component, service} = await setup();
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const first = component.refreshPolicy(history);
    service.listUsers.mockResolvedValueOnce([{...user('Alice', 'Europe/Vienna'), displayName: 'Fresh profile'}, user('Bob')]);
    await component.refreshPolicy(stats);
    old.resolve([user(), user('Bob')]); await first;
    expect(component.users[0]).toMatchObject({timezone: 'Europe/Vienna', displayName: 'Fresh profile'});
  });

  it('does not remove a freshly saved user merely because an older policy response omitted them', async () => {
    const {component, service} = await setup();
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const policySave = component.refreshPolicy(history);
    component.users[0].timezone = 'Europe/London';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/London'), user('Bob')]);
    await component.saveUser(component.users[0]);
    old.resolve([user('Bob')]); await policySave;
    expect(component.users.map(value => value.userId)).toEqual(['Bob', 'Alice']);
    expect(component.users.find(value => value.userId === 'Alice')?.timezone).toBe('Europe/London');
  });

  it('does not partially rebase drafts when a dependent policy read fails', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    service.loadSyncSchedulePolicy.mockRejectedValueOnce(new Error('Policy read interrupted'));
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Europe/Vienna'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('Europe/London');
    component.users[0].timezone = 'UTC';
    service.listUsers.mockResolvedValueOnce([user('Alice', 'Asia/Tokyo'), user('Bob')]);
    await component.refreshPolicy(history);
    expect(component.users[0].timezone).toBe('Asia/Tokyo');
  });
  it('keeps newer capability metadata when an older saved-user read finishes afterward', async () => {
    const {component, service} = await setup();
    component.users[0].timezone = 'Europe/London';
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const saving = component.saveUser(component.users[0]);
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledTimes(2));
    service.listUsers.mockResolvedValueOnce([{...user('Alice', 'Europe/London'), hasRefreshToken: false,
      lastError: 'Reconnect needed', requiredTasks: {shared_playlists: 'Current dependency'}}, user('Bob')]);
    await component.refreshPolicy(history);
    old.resolve([user('Alice', 'Europe/London'), user('Bob')]); await saving;
    expect(component.users[0]).toMatchObject({timezone: 'Europe/London', hasRefreshToken: false,
      lastError: 'Reconnect needed', requiredTasks: {shared_playlists: 'Current dependency'}});
    expect(component.userSaveStates.get('Alice')).toBe('saved');
    expect(service.updateUser).toHaveBeenCalledOnce();
  });

  it('does not resurrect a reviewed deletion from an older policy inventory response', async () => {
    const {component, service} = await setup();
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const policy = component.refreshPolicy(history);
    service.listUsers.mockResolvedValueOnce([user('Bob')]);
    service.reviewPendingProfile.mockResolvedValueOnce({eligible: true, spotifyId: 'pending:server-reviewed', createdAt: '', blockers: []});
    const action = component.reviewIncompleteProfile(component.users[0]);
    await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
    component.confirmPendingProfileDeletion(); await action;
    old.resolve([user(), user('Bob')]); await policy;
    expect(component.users.map(value => value.userId)).toEqual(['Bob']);
    expect(service.deleteReviewedPendingProfile).toHaveBeenCalledExactlyOnceWith('Alice', 'pending:server-reviewed');
    expect(service.updateUser).not.toHaveBeenCalled();
  });

  it.each(['save', 'recovery'] as const)('does not republish a late %s read failure for a user removed by a newer inventory', async operation => {
    const {component, service} = await setup();
    const alice = component.users[0];
    if (operation === 'recovery') {
      service.listUsers.mockRejectedValueOnce(new Error('Initial read failed'));
      await component.saveUser(alice);
    }
    const old = held<AdminUserSyncSettings[]>(); service.listUsers.mockReturnValueOnce(old.promise);
    const pending = operation === 'save' ? component.saveUser(alice) : component.refreshUserSettings(alice);
    await vi.waitFor(() => expect(component.userReadbackRequired.has('Alice')).toBe(true));
    // Wait until the owned read is actually pending before a later read removes Alice.
    await vi.waitFor(() => expect(service.listUsers).toHaveBeenCalledTimes(operation === 'save' ? 2 : 3));
    service.listUsers.mockResolvedValueOnce([user('Bob')]);
    await component.refreshPolicy(history);
    old.reject(new Error('Stale private read failure')); await pending;
    expect(component.users.map(value => value.userId)).toEqual(['Bob']);
    expect(component.userSaveStates.has('Alice')).toBe(false);
    expect(component.userReadbackRequired.has('Alice')).toBe(false);
    expect(component.errorMessage).toBe('');
    expect(service.updateUser).toHaveBeenCalledOnce();
  });


});
