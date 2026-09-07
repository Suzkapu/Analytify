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
            return { data: name === 'get_notification_preferences' ? [preferences] : null, error: null };
        });
        requestSubscription = vi.fn().mockName('requestSubscription').mockResolvedValue(subscription);
        TestBed.configureTestingModule({
            providers: [
                PushNotificationService,
                {
                    provide: SwPush,
                    useValue: { isEnabled: true, subscription: defer(() => of(browserSubscription)), requestSubscription }
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
