import { beforeEach, describe, expect, it, type Mock, type MockedObject, vi } from "vitest";
import { TestBed } from '@angular/core/testing';

import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { AdminService } from './admin.service';
import { AdminUserSyncSettings } from './admin.models';

describe('AdminService', () => {
    let service: AdminService;
    let auth: any;
    let rpc: Mock;
    let invoke: Mock;

    beforeEach(() => {
        auth = {
            getSupabaseUserId: vi.fn().mockName("SpotifyAuthService.getSupabaseUserId")
        };
        rpc = vi.fn().mockName('rpc').mockResolvedValue({ data: true, error: null });
        invoke = vi.fn().mockName('invoke').mockResolvedValue({ data: { ok: true, sent: 1 }, error: null });
        TestBed.configureTestingModule({ providers: [
                AdminService,
                { provide: SpotifyAuthService, useValue: auth },
                { provide: SupabaseService, useValue: { client: { rpc, functions: { invoke } } } }
            ] });
        service = TestBed.inject(AdminService);
    });

    it('does not query Supabase for a local-only session', async () => {
        auth.getSupabaseUserId.mockReturnValue(null);

        expect(await service.isAdmin(true)).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('checks the trusted RPC when a cloud identity exists', async () => {
        auth.getSupabaseUserId.mockReturnValue('supabase-user');

        expect(await service.isAdmin(true)).toBe(true);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('is_app_admin');
    });

    it('caches admin status for one identity and invalidates it when the session changes', async () => {
        auth.getSupabaseUserId.mockReturnValue('user-a');
        expect(await service.isAdmin()).toBe(true);
        expect(await service.isAdmin()).toBe(true);
        expect(rpc).toHaveBeenCalledTimes(1);

        auth.getSupabaseUserId.mockReturnValue('user-b');
        expect(await service.isAdmin()).toBe(true);
        expect(rpc).toHaveBeenCalledTimes(2);
    });

    it('sends a test push only through the authenticated notification function', async () => {
        expect(await service.sendTestNotification()).toBe(1);
        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('song-league-notifications', {
            body: { action: 'test' }
        });
    });

    it('maps queue, lease, feature, release, and alert health', async () => {
        rpc.mockResolvedValue({ data: {
                syncQueueDepth: 7, oldestSyncQueueAgeSeconds: 83,
                notificationQueueDepth: 4, oldestNotificationQueueAgeSeconds: 42, expiredLeases: 1,
                lastSuccessByFeature: { listening_history: 'now' }, releases: { worker: 'abc' },
                alerts: [{ key: 'expired-sync-leases', severity: 'critical', message: 'Lease expired.' }]
            }, error: null });

        const health = await service.loadOperationalHealth();

        expect(rpc).toHaveBeenCalledWith('admin_operational_health');
        expect(health.syncQueueDepth).toBe(7);
        expect(health.notificationQueueDepth).toBe(4);
        expect(health.expiredLeases).toBe(1);
        expect(health.lastSuccessByFeature.listening_history).toBe('now');
        expect(health.releases['worker']).toBe('abc');
        expect(health.alerts[0].severity).toBe('critical');
    });

    it('loads the persisted interval unit for every scheduled task', async () => {
        rpc.mockImplementation((name: string) => Promise.resolve({ data: name === 'admin_list_schedule_status' ? [{
                    user_id: 'user-1', next_effective_run_at: '2026-09-11T08:00:00Z', manual_job_retained: true
                }] : [{
                    user_id: 'user-1', spotify_id: 'spotify-1', display_name: 'Listener',
                    history_interval_unit: 'hours', short_term_interval_unit: 'minutes',
                    medium_term_interval_unit: 'days', long_term_interval_unit: 'days',
                    song_league_playlist_fridays_only: false,
                    song_league_playlist_interval_unit: 'hours', shared_playlist_interval_unit: 'minutes'
                }], error: null }));

        const [user] = await service.listUsers();

        expect(user.historyIntervalUnit).toBe('hours');
        expect(user.shortTermIntervalUnit).toBe('minutes');
        expect(user.mediumTermIntervalUnit).toBe('days');
        expect(user.longTermIntervalUnit).toBe('days');
        expect(user.songLeaguePlaylistFridaysOnly).toBe(false);
        expect(user.songLeaguePlaylistIntervalUnit).toBe('hours');
        expect(user.sharedPlaylistIntervalUnit).toBe('minutes');
        expect(user.nextEffectiveRunAt).toBe('2026-09-11T08:00:00Z');
        expect(user.manualJobRetained).toBe(true);
    });

    it('saves all selected interval units with the schedule values', async () => {
        const user = {
            userId: 'user-1', spotifyId: 'spotify-1', displayName: 'Listener', profilePicUrl: '',
            backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'Europe/Vienna',
            historyEnabled: true, historyIntervalMinutes: 2, historyIntervalUnit: 'hours',
            shortTermEnabled: true, shortTermIntervalHours: 30, shortTermIntervalUnit: 'minutes',
            mediumTermEnabled: true, mediumTermIntervalHours: 2, mediumTermIntervalUnit: 'days',
            longTermEnabled: true, longTermIntervalHours: 3, longTermIntervalUnit: 'days',
            songLeaguePlaylistsEnabled: true, songLeaguePlaylistFridaysOnly: false,
            songLeaguePlaylistIntervalMinutes: 4, songLeaguePlaylistIntervalUnit: 'hours',
            sharedPlaylistsEnabled: true, sharedPlaylistIntervalMinutes: 5, sharedPlaylistIntervalUnit: 'minutes',
            lastSuccessAt: null, lastError: null
        } as AdminUserSyncSettings;
        rpc.mockResolvedValue({ data: null, error: null });

        await service.updateUser(user);

        const parameters = vi.mocked(rpc).mock.lastCall![1];
        expect(parameters.p_history_interval_unit).toBe('hours');
        expect(parameters.p_short_term_interval_unit).toBe('minutes');
        expect(parameters.p_medium_term_interval_unit).toBe('days');
        expect(parameters.p_long_term_interval_unit).toBe('days');
        expect(parameters.p_song_league_playlist_fridays_only).toBe(false);
        expect(parameters.p_song_league_playlist_interval_unit).toBe('hours');
        expect(parameters.p_shared_playlist_interval_unit).toBe('minutes');
    });
});
