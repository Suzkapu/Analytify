import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { defer, of } from 'rxjs';

import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { PushNotificationService, PushNotificationSettings } from './push-notification.service';

describe('PushNotificationService', () => {
    let service: PushNotificationService;
    let rpc: Mock;
    let getClient: Mock;
    let requestSubscription: Mock;
    let browserSubscription: PushSubscription | null;
    let permissionState: PermissionState;
    let registeredEndpoint: string | null;
    let swPush: {isEnabled: boolean; subscription: ReturnType<typeof defer>; requestSubscription: Mock};
    let preferences: {
        song_league_enabled: boolean;
        song_league_song_added_enabled: boolean;
        song_league_member: boolean;
        stats_access_requests_enabled: boolean;
    };
    const subscription = {
        endpoint: 'https://push.example/device',
        toJSON: () => ({
            endpoint: 'https://push.example/device',
            keys: { p256dh: 'public-key', auth: 'auth-secret' }
        })
    } as unknown as PushSubscription;

    beforeEach(() => {
        browserSubscription = null;
        registeredEndpoint = null;
        permissionState = 'granted';
        preferences = {
            song_league_enabled: false,
            song_league_song_added_enabled: false,
            song_league_member: true,
            stats_access_requests_enabled: true
        };
        vi.spyOn(navigator.permissions, 'query').mockImplementation(async () => ({
            state: permissionState
        } as PermissionStatus));
        rpc = vi.fn().mockName('rpc').mockImplementation(async (name: string, parameters?: any) => {
            if (name === 'set_notification_preference') {
                if (parameters.p_category === 'song_league')
                    preferences.song_league_enabled = parameters.p_enabled;
                if (parameters.p_category === 'song_league_song_added') {
                    preferences.song_league_song_added_enabled = parameters.p_enabled;
                }
                if (parameters.p_category === 'stats_access_requests') {
                    preferences.stats_access_requests_enabled = parameters.p_enabled;
                }
            }
            if (name === 'upsert_push_subscription') registeredEndpoint = parameters.p_endpoint;
            return {
                data: name === 'get_notification_settings' ? [{
                    ...preferences,
                    device_registered: !!parameters?.p_endpoint && parameters.p_endpoint === registeredEndpoint,
                    registered_device_count: registeredEndpoint ? 1 : 0
                }] : null,
                error: null
            };
        });
        requestSubscription = vi.fn().mockName('requestSubscription').mockResolvedValue(subscription);
        getClient = vi.fn().mockResolvedValue({rpc});
        swPush = {isEnabled: true, subscription: defer(() => of(browserSubscription)), requestSubscription};
        TestBed.configureTestingModule({
            providers: [
                PushNotificationService,
                {
                    provide: SwPush,
                    useValue: swPush
                },
                { provide: SupabaseService, useValue: { client: { rpc }, getClient } }
            ]
        });
        service = TestBed.inject(PushNotificationService);
    });

    const enableDevice = (value: PushNotificationService): Promise<PushNotificationSettings> =>
        (value as PushNotificationService & {enableDevice(): Promise<PushNotificationSettings>}).enableDevice();

    it('does not register an existing browser subscription while saving only a category preference', async () => {
        browserSubscription = subscription;
        const update = service as PushNotificationService & {
            setCategoryPreference(category: 'song_league', enabled: boolean): Promise<PushNotificationSettings>;
        };
        const settings = await update.setCategoryPreference('song_league', true);
        expect(settings.songLeagueEnabled).toBe(true); expect(settings.deviceRegistered).toBe(false);
        expect(settings.active).toBe(false); expect(requestSubscription).not.toHaveBeenCalled();
        expect(rpc.mock.calls.map(call => call[0])).toEqual(['set_notification_preference', 'get_notification_settings']);
    });

    it('waits for client readiness before saving a preference and surfaces its rejection without registering', async () => {
        let ready!: (client: unknown) => void;
        getClient.mockReturnValueOnce(new Promise(resolve => {ready = resolve;}));
        const pending = service.setCategoryPreference('song_league', true);
        expect(rpc).not.toHaveBeenCalled();
        ready({rpc}); await pending;
        expect(rpc.mock.calls.map(call => call[0])).toEqual(['set_notification_preference', 'get_notification_settings']);
        const failure = new Error('Preference rejected'); rpc.mockResolvedValueOnce({data: null, error: failure});
        await expect(service.setCategoryPreference('song_league', false)).rejects.toBe(failure);
        expect(preferences.song_league_enabled).toBe(true); expect(requestSubscription).not.toHaveBeenCalled();
    });

    it.each(['song_league', 'song_league_song_added', 'stats_access_requests'] as const)(
        'saves %s independently of device permission without registering or delivering notifications', async category => {
            permissionState = 'denied'; swPush.isEnabled = false;
            const update = service as PushNotificationService & {
                setCategoryPreference(category: 'song_league' | 'song_league_song_added' | 'stats_access_requests', enabled: boolean): Promise<PushNotificationSettings>;
            };
            const settings = await update.setCategoryPreference(category, true);
            expect(preferences[`${category}_enabled`]).toBe(true);
            expect(settings.deviceSubscribed).toBe(false);
            expect(settings.deviceRegistered).toBe(false);
            expect(settings.active).toBe(false); expect(settings.songAddedActive).toBe(false); expect(settings.statsAccessActive).toBe(false);
            expect(requestSubscription).not.toHaveBeenCalled();
            expect(rpc.mock.calls.map(call => call[0])).toEqual(['set_notification_preference', 'get_notification_settings']);
        });

    it('enables this device while preserving every disabled category and sending no notification', async () => {
        preferences.stats_access_requests_enabled = false;
        const settings = await enableDevice(service);
        expect(settings.deviceState).toBe('registered');
        expect(settings.deviceSubscribed).toBe(true);
        expect(settings.songLeagueEnabled).toBe(false);
        expect(settings.songLeagueSongAddedEnabled).toBe(false);
        expect(settings.statsAccessRequestsEnabled).toBe(false);
        expect(settings.active).toBe(false); expect(settings.statsAccessActive).toBe(false);
        expect(preferences).toEqual({song_league_enabled: false, song_league_song_added_enabled: false,
            song_league_member: true, stats_access_requests_enabled: false});
        expect(rpc.mock.calls.map(call => call[0])).toEqual(['upsert_push_subscription', 'get_notification_settings']);
    });

    it('enables an existing device without requesting permission again or changing preferences', async () => {
        browserSubscription = subscription; preferences.song_league_enabled = true;
        const settings = await enableDevice(service);
        expect(requestSubscription).not.toHaveBeenCalled();
        expect(settings.deviceState).toBe('registered'); expect(settings.active).toBe(true);
        expect(rpc.mock.calls.some(call => call[0] === 'set_notification_preference')).toBe(false);
    });

    it.each(['denied', 'unsupported'] as const)('rejects device enabling when %s without server writes', async state => {
        if (state === 'denied') permissionState = 'denied';
        else swPush.isEnabled = false;
        await expect(enableDevice(service)).rejects.toThrow(state === 'denied' ? 'Notifications are blocked' : 'not supported');
        expect(requestSubscription).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
    });

    it('reports registration failure and permits retry without changing saved categories', async () => {
        const originalRpc = rpc.getMockImplementation()!;
        rpc.mockImplementation(async (name, parameters) => name === 'upsert_push_subscription'
            ? {data: null, error: new Error('Device registration unavailable')}
            : originalRpc(name, parameters));
        await expect(enableDevice(service)).rejects.toThrow('Device registration unavailable');
        expect(registeredEndpoint).toBeNull(); expect(preferences.song_league_enabled).toBe(false);
        rpc.mockImplementation(originalRpc);
        expect((await enableDevice(service)).deviceState).toBe('registered');
        expect(rpc.mock.calls.some(call => call[0] === 'set_notification_preference')).toBe(false);
    });

    it('recovers a browser registration rejection after the browser has actually subscribed', async () => {
        requestSubscription.mockImplementation(async () => {
            browserSubscription = subscription; throw new Error('Duplicate registration');
        });
        const settings = await enableDevice(service);
        expect(settings.deviceState).toBe('registered');
        expect(rpc.mock.calls.some(call => call[0] === 'set_notification_preference')).toBe(false);
    });

    it('does not send notification settings requests until client readiness resolves', async () => {
        let ready!: (client: any) => void;
        getClient.mockReturnValue(new Promise(resolve => { ready = resolve; }));
        const pending = service.loadSettings();
        await vi.waitFor(() => expect(getClient).toHaveBeenCalled());
        expect(rpc).not.toHaveBeenCalled();
        ready({rpc});
        await pending;
        expect(rpc).toHaveBeenCalledWith('get_notification_settings', {p_endpoint: null});
    });

    it('propagates notification client initialization failure without a preference request', async () => {
        const failure = new Error('Client unavailable');
        getClient.mockRejectedValue(failure);
        await expect(service.loadSettings()).rejects.toBe(failure);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('reuses a browser subscription that was already granted instead of registering again', async () => {
        browserSubscription = subscription;

        const settings = await service.setSongLeagueEnabled(true);

        expect(requestSubscription).not.toHaveBeenCalled();
        expect(settings.deviceSubscribed).toBe(true);
        expect(settings.deviceRegistered).toBe(true);
        expect(settings.deviceState).toBe('registered');
        expect(rpc).toHaveBeenCalledWith('upsert_push_subscription', expect.any(Object));
    });

    it('reconciles a completed browser registration when its promise reports a duplicate push error', async () => {
        requestSubscription.mockImplementation(async () => {
            browserSubscription = subscription;
            throw new Error('Registration failed - push service error');
        });

        const settings = await service.setSongLeagueEnabled(true);

        expect(settings.deviceSubscribed).toBe(true);
        expect(rpc).toHaveBeenCalledWith('upsert_push_subscription', expect.any(Object));
    });

    it('turns the effective state off when a temporary browser permission expires', async () => {
        browserSubscription = subscription;
        permissionState = 'prompt';
        preferences.song_league_enabled = true;

        const settings = await service.loadSettings();

        expect(settings.songLeagueEnabled).toBe(true);
        expect(settings.deviceSubscribed).toBe(true);
        expect(settings.permission).toBe('default');
        expect(settings.active).toBe(false);
        expect(settings.deviceState).toBe('permission-required');
    });

    it('registers the current PWA device before enabling Song League notifications', async () => {
        const settings = await service.setSongLeagueEnabled(true);

        expect(requestSubscription).toHaveBeenCalledWith({ serverPublicKey: expect.any(String) });
        expect(rpc).toHaveBeenCalledWith('upsert_push_subscription', {
            p_endpoint: 'https://push.example/device',
            p_p256dh: 'public-key',
            p_auth: 'auth-secret',
            p_user_agent: expect.any(String)
        });
        expect(rpc).toHaveBeenCalledWith('set_notification_preference', {
            p_category: 'song_league', p_enabled: true
        });
        expect(settings.songLeagueEnabled).toBe(true);
        expect(settings.deviceSubscribed).toBe(true);
        expect(settings.deviceRegistered).toBe(true);
    });

    it('does not request permission again after the browser denied it', async () => {
        permissionState = 'denied';

        await expect(service.setSongLeagueEnabled(true)).rejects.toThrow(/blocked/i);

        expect(requestSubscription).not.toHaveBeenCalled();
        const settings = await service.loadSettings();
        expect(settings.deviceState).toBe('denied');
    });

    it('distinguishes a server-only registration from this browser device', async () => {
        registeredEndpoint = 'https://push.example/other-device';
        preferences.song_league_enabled = true;

        const settings = await service.loadSettings();

        expect(settings.registeredDeviceCount).toBe(1);
        expect(settings.deviceRegistered).toBe(false);
        expect(settings.deviceState).toBe('server-only');
        expect(settings.active).toBe(false);
    });

    it('distinguishes granted permission without a local subscription', async () => {
        const settings = await service.loadSettings();

        expect(settings.permission).toBe('granted');
        expect(settings.deviceState).toBe('subscription-missing');
        expect(settings.active).toBe(false);
    });

    it('reports an unsupported browser without requesting permission', async () => {
        swPush.isEnabled = false;

        const settings = await service.loadSettings();

        expect(settings.supported).toBe(false);
        expect(settings.deviceState).toBe('unsupported');
        expect(requestSubscription).not.toHaveBeenCalled();
    });

    it('repairs a missing server registration for the current PushSubscription idempotently', async () => {
        browserSubscription = subscription;
        preferences.song_league_enabled = true;

        const first = await service.loadSettings();
        const second = await service.loadSettings();

        expect(first.active).toBe(true);
        expect(second.active).toBe(true);
        expect(rpc.mock.calls.filter(([name]) => name === 'upsert_push_subscription')).toHaveLength(1);
    });

    it('turns off Song League delivery without deleting the device subscription needed by future categories', async () => {
        const settings = await service.setSongLeagueEnabled(false);

        expect(requestSubscription).not.toHaveBeenCalled();
        expect(rpc).toHaveBeenCalledWith('set_notification_preference', {
            p_category: 'song_league', p_enabled: false
        });
        expect(settings.songLeagueEnabled).toBe(false);
    });

    it('keeps new-song notifications off by default and enables them as a separate category', async () => {
        browserSubscription = subscription;

        const initial = await service.loadSettings();
        const enabled = await service.setSongLeagueSongAddedEnabled(true);

        expect(initial.songAddedActive).toBe(false);
        expect(rpc).toHaveBeenCalledWith('set_notification_preference', {
            p_category: 'song_league_song_added', p_enabled: true
        });
        expect(enabled.songAddedActive).toBe(true);
        expect(enabled.songLeagueEnabled).toBe(false);
    });

    it('enables stats-request notifications as an independent default-on category', async () => {
        browserSubscription = subscription;

        const initial = await service.loadSettings();
        const disabled = await service.setStatsAccessRequestsEnabled(false);

        expect(initial.statsAccessActive).toBe(true);
        expect(rpc).toHaveBeenCalledWith('set_notification_preference', {
            p_category: 'stats_access_requests', p_enabled: false
        });
        expect(disabled.statsAccessRequestsEnabled).toBe(false);
        expect(disabled.songLeagueEnabled).toBe(false);
    });
});
