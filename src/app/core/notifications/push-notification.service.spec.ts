import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { defer, of } from 'rxjs';

import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService', () => {
    let service: PushNotificationService;
    let rpc: Mock;
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
        swPush = {isEnabled: true, subscription: defer(() => of(browserSubscription)), requestSubscription};
        TestBed.configureTestingModule({
            providers: [
                PushNotificationService,
                {
                    provide: SwPush,
                    useValue: swPush
                },
                { provide: SupabaseService, useValue: { client: { rpc } } }
            ]
        });
        service = TestBed.inject(PushNotificationService);
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
