import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {PushNotificationService, PushNotificationSettings} from '@core/notifications/push-notification.service';
import {V2NotificationSettingsController} from './v2-notification-settings.controller';

const saved: PushNotificationSettings = {
  supported: true, installedPwa: false, permission: 'default', deviceSubscribed: false, deviceRegistered: false,
  registeredDeviceCount: 0, deviceState: 'permission-required', songLeagueEnabled: true,
  songLeagueSongAddedEnabled: false, songLeagueMember: true, statsAccessRequestsEnabled: false,
  active: false, songAddedActive: false, statsAccessActive: false
};
const ready: PushNotificationSettings = {...saved, permission: 'granted', deviceSubscribed: true, deviceRegistered: true,
  registeredDeviceCount: 1, deviceState: 'registered', active: true};
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function setup() {
  let actor = 'actor-a';
  const service = {loadSettings: vi.fn().mockResolvedValue(saved), enableDevice: vi.fn().mockResolvedValue(ready),
    setCategoryPreference: vi.fn().mockResolvedValue({...saved, statsAccessRequestsEnabled: true})};
  TestBed.configureTestingModule({providers: [V2NotificationSettingsController,
    {provide: SpotifyAuthService, useValue: {getUserId: () => actor}},
    {provide: PushNotificationService, useValue: service}]});
  return {controller: TestBed.inject(V2NotificationSettingsController), service,
    lifecycle: TestBed.inject(SessionLifecycleService), replaceActor: () => {actor = 'actor-b';}};
}

describe('notification Settings page state', () => {
  it('loads saved categories without requesting device permission and refreshes cached settings', async () => {
    const {controller, service} = setup(); const pending = deferred<PushNotificationSettings>();
    await controller.reload(); expect(controller.settings()).toEqual(saved); expect(service.enableDevice).not.toHaveBeenCalled();
    service.loadSettings.mockReturnValueOnce(pending.promise); const refresh = controller.reload();
    expect(controller.loading()).toBe(true); expect(controller.settings()).toEqual(saved);
    pending.resolve(ready); await refresh; expect(controller.settings()).toEqual(ready); expect(controller.loading()).toBe(false);
  });
  it('keeps cached categories on refresh failure and allows recovery', async () => {
    const {controller, service} = setup(); await controller.reload();
    service.loadSettings.mockRejectedValueOnce(new Error('Settings unavailable')); await controller.reload();
    expect(controller.settings()).toEqual(saved); expect(controller.error()).toBe('Settings unavailable');
    await controller.reload(); expect(controller.error()).toBe(''); expect(controller.loading()).toBe(false);
  });
  it('uses a useful generic error when the service supplies no message', async () => {
    const {controller, service} = setup(); service.loadSettings.mockRejectedValueOnce(null);
    await controller.reload(); expect(controller.error()).toBe('Notification settings could not be updated. Try again.');
    expect(controller.settings()).toBeNull(); expect(controller.loading()).toBe(false);
  });
  it.each(['success', 'failure'])('discards an older refresh after the newest refresh finishes (%s)', async outcome => {
    const {controller, service} = setup(); const old = deferred<PushNotificationSettings>();
    service.loadSettings.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ready);
    const first = controller.reload(); await controller.reload();
    if (outcome === 'success') old.resolve(saved); else old.reject(new Error('Old failure'));
    await first; expect(controller.settings()).toEqual(ready); expect(controller.error()).toBe('');
  });
  it('enables the device once and preserves saved categories while blocking duplicate actions and refresh', async () => {
    const {controller, service} = setup(); await controller.reload(); const pending = deferred<PushNotificationSettings>();
    service.enableDevice.mockReturnValueOnce(pending.promise); const action = controller.enableDevice();
    expect(controller.saving()).toBe(true); expect(controller.settings()).toEqual(saved);
    await controller.enableDevice(); await controller.setCategory('stats_access_requests', true); await controller.reload();
    expect(service.enableDevice).toHaveBeenCalledOnce(); expect(service.loadSettings).toHaveBeenCalledOnce();
    expect(service.setCategoryPreference).not.toHaveBeenCalled();
    pending.resolve(ready); await action; expect(controller.settings()).toEqual(ready); expect(controller.saving()).toBe(false);
    expect(controller.message()).toBe('Notification settings saved.');
  });
  it('saves a category independently of a denied device and restores saved state on failure', async () => {
    const {controller, service} = setup(); service.loadSettings.mockResolvedValue({...saved, deviceState: 'denied', permission: 'denied'});
    await controller.reload(); service.setCategoryPreference.mockRejectedValueOnce(new Error('Preference failed'));
    await controller.setCategory('stats_access_requests', true);
    expect(controller.settings()?.statsAccessRequestsEnabled).toBe(false); expect(controller.error()).toBe('Preference failed');
    await controller.setCategory('stats_access_requests', true);
    expect(service.setCategoryPreference).toHaveBeenLastCalledWith('stats_access_requests', true);
    expect(controller.settings()?.statsAccessRequestsEnabled).toBe(true); expect(service.enableDevice).not.toHaveBeenCalled();
  });
  it.each(['denied', 'unsupported'] as const)('explains %s through actual settings without attempting device registration', async deviceState => {
    const {controller, service} = setup(); service.loadSettings.mockResolvedValue({...saved, deviceState});
    await controller.reload(); await controller.enableDevice(); expect(service.enableDevice).not.toHaveBeenCalled();
    expect(controller.settings()?.deviceState).toBe(deviceState);
  });
  it('does not mutate before settings are available', async () => {
    const {controller, service} = setup(); await controller.enableDevice(); await controller.setCategory('song_league', false);
    expect(service.enableDevice).not.toHaveBeenCalled(); expect(service.setCategoryPreference).not.toHaveBeenCalled();
  });
  it.each([
    ['actor', 'success'], ['actor', 'failure'], ['generation', 'success'], ['generation', 'failure'],
    ['destroy', 'success'], ['destroy', 'failure']
  ] as const)('discards late %s completion (%s)', async (change, outcome) => {
    const {controller, service, lifecycle, replaceActor} = setup(); await controller.reload();
    const pending = deferred<PushNotificationSettings>(); service.enableDevice.mockReturnValueOnce(pending.promise);
    const action = controller.enableDevice();
    if (change === 'actor') replaceActor(); else if (change === 'generation') await lifecycle.invalidateAndDrain(); else controller.ngOnDestroy();
    if (outcome === 'failure') pending.reject(new Error('Old account failure')); else pending.resolve(ready);
    await action;
    expect(controller.error()).toBe(''); expect(controller.message()).toBe('');
    if (change !== 'destroy') {expect(controller.settings()).toBeNull(); expect(controller.saving()).toBe(false);
      await controller.reload(); expect(controller.settings()).toEqual(saved);}
    else {await controller.reload(); await controller.enableDevice(); await controller.setCategory('song_league', false);
      expect(service.loadSettings).toHaveBeenCalledOnce(); expect(service.enableDevice).toHaveBeenCalledOnce();
      expect(service.setCategoryPreference).not.toHaveBeenCalled();}
  });
});
