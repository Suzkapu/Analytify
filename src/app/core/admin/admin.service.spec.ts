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
    let getClient: Mock;

    beforeEach(() => {
        auth = {
            getSupabaseUserId: vi.fn().mockName("SpotifyAuthService.getSupabaseUserId")
        };
        rpc = vi.fn().mockName('rpc').mockResolvedValue({ data: true, error: null });
        invoke = vi.fn().mockName('invoke').mockResolvedValue({ data: { ok: true, sent: 1 }, error: null });
        getClient = vi.fn().mockResolvedValue({rpc, functions: {invoke}});
        TestBed.configureTestingModule({ providers: [
                AdminService,
                { provide: SpotifyAuthService, useValue: auth },
                { provide: SupabaseService, useValue: { client: { rpc, functions: { invoke } }, getClient } }
            ] });
        service = TestBed.inject(AdminService);
    });

    it('waits for client readiness before requesting public settings', async () => {
        let ready!: (client: any) => void;
        getClient.mockReturnValue(new Promise(resolve => { ready = resolve; }));
        rpc.mockResolvedValue({data: [{announcement: 'Hello', allow_song_league_creation: false}], error: null});
        const pending = service.loadSiteSettings();
        expect(rpc).not.toHaveBeenCalled();
        ready({rpc});
        expect(await pending).toEqual({announcement: 'Hello', allowSongLeagueCreation: false});
        expect(rpc).toHaveBeenCalledWith('get_public_site_settings');
    });

    it('coalesces admin checks while client readiness is pending', async () => {
        auth.getSupabaseUserId.mockReturnValue('cloud-user');
        let ready!: (client: any) => void;
        getClient.mockReturnValue(new Promise(resolve => { ready = resolve; }));
        const first = service.isAdmin();
        const second = service.isAdmin();
        expect(first).toBe(second);
        expect(rpc).not.toHaveBeenCalled();
        ready({rpc});
        expect(await first).toBe(true);
        expect(getClient).toHaveBeenCalledOnce();
        expect(rpc).toHaveBeenCalledOnce();
    });

    it('propagates client initialization failure without sending a settings request', async () => {
        const failure = new Error('Client initialization failed');
        getClient.mockRejectedValue(failure);
        await expect(service.loadSiteSettings()).rejects.toBe(failure);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('loads all three user summaries concurrently after one readiness wait', async () => {
        let ready!: (client: any) => void;
        getClient.mockReturnValue(new Promise(resolve => { ready = resolve; }));
        const finish: Array<() => void> = [];
        rpc.mockImplementation(() => new Promise(resolve => {
            finish.push(() => resolve({data: [], error: null}));
        }));
        const pending = service.listUsers();
        expect(rpc).not.toHaveBeenCalled();
        ready({rpc});
        await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
        expect(getClient).toHaveBeenCalledOnce();
        expect(rpc.mock.calls.map(call => call[0])).toEqual([
            'admin_list_users', 'admin_list_schedule_status', 'admin_list_required_sync_reasons'
        ]);
        finish.forEach(resolve => resolve());
        expect(await pending).toEqual([]);
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

    it('maps feature-required task reasons separately from optional admin schedules', async () => {
        rpc.mockImplementation((name: string) => Promise.resolve({data:
            name === 'admin_list_users' ? [{user_id: 'user-1', spotify_id: 'spotify-1', display_name: 'Listener'}] :
            name === 'admin_list_required_sync_reasons' ? [{
                user_id: 'user-1', required_tasks: {stats_short_term: 'Required by active Song League membership'}
            }] : [], error: null}));

        const [user] = await service.listUsers();

        expect(user.requiredTasks?.stats_short_term).toBe('Required by active Song League membership');
        expect(user.shortTermEnabled).toBe(false);
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

    it('maps the private moderation inbox and saves a reasoned decision', async () => {
        rpc.mockResolvedValueOnce({data: [{
            report_id: 'report-id', receipt_code: 'AR-123', category: 'user_safety', status: 'submitted',
            reporter_name: 'Reporter', affected_name: 'Affected', reason: 'Spam', content_url: null,
            outcome: null, decision_reason: null, reporter_notice: null, affected_notice: null,
            appeal_reason: null, created_at: '2026-09-22T10:00:00Z', resolved_at: null, appealed_at: null
        }], error: null}).mockResolvedValueOnce({data: null, error: null});

        const [report] = await service.listModerationReports();
        report.status = 'resolved_no_action';
        report.outcome = 'no_violation';
        report.decisionReason = 'No policy breach found.';
        report.reporterNotice = 'The review is complete.';
        report.affectedNotice = 'No action was taken.';
        await service.updateModerationReport(report);

        expect(rpc).toHaveBeenLastCalledWith('admin_update_moderation_report', expect.objectContaining({
            p_report_id: 'report-id', p_status: 'resolved_no_action', p_outcome: 'no_violation'
        }));
    });
});
