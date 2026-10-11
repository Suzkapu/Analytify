import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {SwPush} from '@angular/service-worker';
import {defer, of} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PushNotificationService, PushNotificationSettings} from '@core/notifications/push-notification.service';
import {V2SettingsNotificationsComponent} from './v2-settings-notifications.component';

const saved: PushNotificationSettings = {supported: true, installedPwa: false, permission: 'default', deviceSubscribed: false,
  deviceRegistered: false, registeredDeviceCount: 0, deviceState: 'permission-required', songLeagueEnabled: true,
  songLeagueSongAddedEnabled: false, songLeagueMember: true, statsAccessRequestsEnabled: false,
  active: false, songAddedActive: false, statsAccessActive: false};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => {resolve = yes;}); return {resolve, promise}; }
function setup(settings = saved) {
  let cloud = 'cloud-a';
  const service = {loadSettings: vi.fn().mockResolvedValue(settings), enableDevice: vi.fn().mockResolvedValue({...settings, deviceState: 'registered'}),
    setCategoryPreference: vi.fn().mockResolvedValue({...settings, statsAccessRequestsEnabled: true})};
  TestBed.configureTestingModule({providers: [provideRouter([]), {provide: SpotifyAuthService, useValue: {getUserId: () => 'actor-a', getSupabaseUserId: () => cloud}},
    {provide: PushNotificationService, useValue: service}]});
  const fixture = TestBed.createComponent(V2SettingsNotificationsComponent); const panel = fixture.nativeElement as HTMLElement;
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  return {fixture, panel, service, settle, replaceCloud: () => {cloud = 'cloud-b';}};
}

describe('Notifications presentation with its actual state controller', () => {
  it.each([
    ['Song League pick window', 'song_league', false],
    ['New Song League pick', 'song_league_song_added', true],
    ['Stats access requests', 'stats_access_requests', true]
  ] as const)('maps %s to its own saved preference', async (label, category, enabled) => {
    const {fixture, panel, service, settle} = setup(); fixture.detectChanges(); await settle();
    (panel.querySelector(`[aria-label="${label}"]`) as HTMLInputElement).click(); await settle();
    expect(service.setCategoryPreference).toHaveBeenCalledOnce(); expect(service.setCategoryPreference).toHaveBeenCalledWith(category, enabled);
    expect(service.enableDevice).not.toHaveBeenCalled();
  });
  it('shows loading without made-up switches, then renders saved values and the install destination', async () => {
    const {fixture, panel, service, settle} = setup(); const pending = deferred<PushNotificationSettings>();
    service.loadSettings.mockReturnValueOnce(pending.promise); fixture.detectChanges();
    expect(panel.textContent).toContain('Loading notification settings'); expect(panel.querySelector('input')).toBeNull();
    pending.resolve(saved); await settle();
    expect(panel.textContent).toContain("Notifications aren't enabled"); expect(panel.querySelectorAll('input')).toHaveLength(3);
    expect((panel.querySelector('input') as HTMLInputElement).checked).toBe(true);
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('/settings/install'); expect(service.enableDevice).not.toHaveBeenCalled();
  });
  it.each(['denied', 'unsupported', 'registered'] as const)('explains %s and leaves category preferences usable', async deviceState => {
    const {fixture, panel, settle, service} = setup({...saved, deviceState}); fixture.detectChanges(); await settle();
    expect(panel.querySelector('button')).toBeNull();
    expect(panel.textContent).toContain(deviceState === 'denied' ? 'Notifications are blocked' : deviceState === 'unsupported' ? 'Notifications are unavailable' : 'Notifications enabled');
    const stats = panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement; stats.click(); await settle();
    expect(service.setCategoryPreference).toHaveBeenCalledWith('stats_access_requests', true); expect(stats.checked).toBe(true);
    expect(service.enableDevice).not.toHaveBeenCalled();
  });
  it('keeps a failed category unchecked and cached, then recovers through an authoritative refresh', async () => {
    const {fixture, panel, service, settle} = setup(); fixture.detectChanges(); await settle();
    service.setCategoryPreference.mockRejectedValueOnce(new Error('Preference save failed'));
    const stats = panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement; stats.click(); await settle();
    expect(stats.checked).toBe(false); expect(panel.querySelector('[role="alert"]')?.textContent).toBe('Preference save failed');
    (panel.querySelector('button') as HTMLButtonElement).click(); await settle();
    expect(panel.querySelector('[role="alert"]')).toBeNull(); expect(stats.checked).toBe(false); expect(service.loadSettings).toHaveBeenCalledTimes(2);
  });
  it('disables duplicate actions while registering a device and restores ready state without category writes', async () => {
    const {fixture, panel, service, settle} = setup(); fixture.detectChanges(); await settle();
    const pending = deferred<PushNotificationSettings>(); service.enableDevice.mockReturnValueOnce(pending.promise);
    (panel.querySelector('button') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(panel.textContent).toContain('Setting up notifications'); expect((panel.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect([...panel.querySelectorAll('input')].every(input => input.disabled)).toBe(true);
    (panel.querySelector('button') as HTMLButtonElement).click(); expect(service.enableDevice).toHaveBeenCalledOnce();
    pending.resolve({...saved, deviceState: 'registered'}); await settle();
    expect(panel.textContent).toContain('Notifications enabled'); expect(service.setCategoryPreference).not.toHaveBeenCalled();
  });
  it('does not describe saving a category as requesting browser permission', async () => {
    const {fixture, panel, service, settle} = setup(); fixture.detectChanges(); await settle();
    const pending = deferred<PushNotificationSettings>(); service.setCategoryPreference.mockReturnValueOnce(pending.promise);
    (panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement).click(); fixture.detectChanges();
    expect(panel.textContent).not.toContain('Allow notifications when your browser asks');
    expect((panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement).checked).toBe(false);
    pending.resolve({...saved, statsAccessRequestsEnabled: true}); await settle();
    expect((panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement).checked).toBe(true);
  });
  it('refreshes on browser focus while preserving cached preferences and recovers from initial failure', async () => {
    const {fixture, panel, service, settle} = setup(); service.loadSettings.mockRejectedValueOnce(new Error('Unavailable'));
    fixture.detectChanges(); await settle(); expect(panel.querySelector('input')).toBeNull();
    (panel.querySelector('button') as HTMLButtonElement).click(); await settle();
    const pending = deferred<PushNotificationSettings>(); service.loadSettings.mockReturnValueOnce(pending.promise);
    window.dispatchEvent(new Event('focus')); fixture.detectChanges();
    expect(panel.textContent).toContain('Refreshing notification settings'); expect(panel.querySelectorAll('input')).toHaveLength(3);
    pending.resolve(saved); await settle(); expect(panel.textContent).not.toContain('Refreshing');
  });
  it('does not offer new-song preferences to a nonmember', async () => {
    const {fixture, panel, settle} = setup({...saved, songLeagueMember: false}); fixture.detectChanges(); await settle();
    expect(panel.querySelector('[aria-label="New Song League pick"]')).toBeNull(); expect(panel.querySelectorAll('input')).toHaveLength(2);
  });
  it('rejects a stale cloud checkbox action and recovers through the actual browser-focus refresh', async () => {
    const {fixture, panel, service, settle, replaceCloud} = setup(); fixture.detectChanges(); await settle();
    replaceCloud(); (panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement).click(); await settle();
    expect(service.setCategoryPreference).not.toHaveBeenCalled(); expect(panel.querySelector('input')).toBeNull();
    const pending = deferred<PushNotificationSettings>(); service.loadSettings.mockReturnValueOnce(pending.promise);
    window.dispatchEvent(new Event('focus')); fixture.detectChanges();
    expect(panel.textContent).toContain('Loading notification settings'); expect(panel.querySelector('input')).toBeNull();
    pending.resolve({...saved, statsAccessRequestsEnabled: true}); await settle();
    expect((panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement).checked).toBe(true);
    expect(panel.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('Notifications composition with the real push service and isolated boundaries', () => {
  function setupBoundary(permission: PermissionState) {
    let browserSubscription: PushSubscription | null = null; let registered = false; let stats = false; let failRead = false;
    let permissionAfterPrompt: PermissionState = 'granted'; let lagAfterPrompt = false;
    const subscription = {endpoint: 'https://push.example/isolated-device', toJSON: () => ({endpoint: 'https://push.example/isolated-device', keys: {p256dh: 'test-key', auth: 'test-auth'}})} as unknown as PushSubscription;
    vi.spyOn(navigator.permissions, 'query').mockImplementation(async () => ({state: permission} as PermissionStatus));
    const requestSubscription = vi.fn(async () => {permission = permissionAfterPrompt; browserSubscription = lagAfterPrompt ? null : subscription; return subscription;});
    const rpc = vi.fn(async (name: string, parameters: Record<string, unknown>) => {
      if (name === 'upsert_push_subscription') registered = true;
      if (name === 'set_notification_preference') stats = parameters['p_enabled'] as boolean;
      if (name === 'get_notification_settings' && failRead) {failRead = false; return {data: null, error: new Error('Readback failed')};}
      return {data: name === 'get_notification_settings' ? [{song_league_enabled: false, song_league_song_added_enabled: false,
        song_league_member: true, stats_access_requests_enabled: stats, device_registered: registered, registered_device_count: registered ? 1 : 0}] : null, error: null};
    });
    TestBed.configureTestingModule({providers: [provideRouter([]), PushNotificationService,
      {provide: SpotifyAuthService, useValue: {getUserId: () => 'actor-a', getSupabaseUserId: () => 'cloud-a'}},
      {provide: SwPush, useValue: {isEnabled: true, subscription: defer(() => of(browserSubscription)), requestSubscription}},
      {provide: SupabaseService, useValue: {getClient: async () => ({rpc: (name: string, parameters: Record<string, unknown>) => ({abortSignal: () => rpc(name, parameters)})})}}]});
    const fixture = TestBed.createComponent(V2SettingsNotificationsComponent); const panel = fixture.nativeElement as HTMLElement;
    const settle = async () => {await fixture.whenStable(); fixture.detectChanges();};
    return {fixture, panel, settle, rpc, requestSubscription, failNextRead: () => {failRead = true;},
      promptOutcome: (state: PermissionState) => {permissionAfterPrompt = state; lagAfterPrompt = true;}};
  }
  it('persists a category on a blocked device without browser permission or registration effects', async () => {
    const {fixture, panel, settle, rpc, requestSubscription} = setupBoundary('denied'); fixture.detectChanges(); await settle();
    expect(panel.textContent).toContain('Notifications are blocked');
    const stats = panel.querySelector('[aria-label="Stats access requests"]') as HTMLInputElement; stats.click(); await settle();
    expect(stats.checked).toBe(true); expect(panel.textContent).toContain('Notifications are blocked');
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['get_notification_settings', 'set_notification_preference', 'get_notification_settings']);
    expect(requestSubscription).not.toHaveBeenCalled();
  });
  it('recovers a registered device after failed readback without repeating permission or changing preferences', async () => {
    const {fixture, panel, settle, rpc, requestSubscription, failNextRead} = setupBoundary('prompt'); fixture.detectChanges(); await settle();
    failNextRead(); (panel.querySelector('button') as HTMLButtonElement).click(); await settle();
    expect(panel.querySelector('[role="alert"]')?.textContent).toBe('Readback failed');
    (panel.querySelector('button') as HTMLButtonElement).click(); await settle();
    expect(panel.textContent).toContain('Notifications enabled on this device'); expect(requestSubscription).toHaveBeenCalledOnce();
    expect(rpc.mock.calls.filter(call => call[0] === 'upsert_push_subscription')).toHaveLength(1);
    expect(rpc.mock.calls.some(call => call[0] === 'set_notification_preference')).toBe(false);
    expect([...panel.querySelectorAll('input')].every(input => !input.checked)).toBe(true);
  });
  it.each(['denied', 'prompt'] as const)('renders actual %s permission after a prompt even when the subscription stream lags', async permission => {
    const {fixture, panel, settle, requestSubscription, rpc, promptOutcome} = setupBoundary('prompt'); fixture.detectChanges(); await settle();
    promptOutcome(permission); (panel.querySelector('button') as HTMLButtonElement).click(); await settle();
    expect(panel.textContent).toContain(permission === 'denied' ? 'Notifications are blocked' : "Notifications aren't enabled on this device");
    expect(panel.textContent).not.toContain('Notifications enabled on this device');
    expect([...panel.querySelectorAll('input')].every(input => !input.checked)).toBe(true);
    expect(requestSubscription).toHaveBeenCalledOnce(); expect(rpc.mock.calls.some(call => call[0] === 'set_notification_preference')).toBe(false);
    if (permission === 'denied') expect(panel.querySelector('button')).toBeNull();
  });
});
