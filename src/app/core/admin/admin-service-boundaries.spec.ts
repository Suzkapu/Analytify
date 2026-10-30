import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {AdminService} from './admin.service';
import {AdminModerationReport, AdminUserSyncSettings} from './admin.models';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

describe('AdminService retained RPC boundaries', () => {
  const denied = {code: '42501', message: 'Administrator access required'};
  let service: AdminService;
  let identity: string | null;
  const rpc = vi.fn();
  const invoke = vi.fn();
  const getClient = vi.fn();
  const user = {userId: 'user-a', enabled: false, timezone: 'Europe/Vienna',
    historyEnabled: false, shortTermEnabled: false, mediumTermEnabled: false,
    longTermEnabled: false, songLeaguePlaylistsEnabled: false, sharedPlaylistsEnabled: false,
    requiredTasks: {stats_short_term: 'Active league', song_league_playlists: 'Active league', shared_playlists: 'Shared playlist'}} as AdminUserSyncSettings;

  beforeEach(() => {
    vi.resetAllMocks();
    identity = 'admin-a';
    rpc.mockResolvedValue({data: null, error: null});
    invoke.mockResolvedValue({data: {sent: 0}, error: null});
    getClient.mockResolvedValue({rpc, functions: {invoke}});
    TestBed.configureTestingModule({providers: [AdminService,
      {provide: SpotifyAuthService, useValue: {getSupabaseUserId: () => identity}},
      {provide: SupabaseService, useValue: {getClient}}]});
    service = TestBed.inject(AdminService);
  });

  it('saves the selected user settings at activation even when client readiness is delayed', async () => {
    const client = deferred<any>();
    getClient.mockReturnValueOnce(client.promise);
    const draft = {...user, enabled: true, timezone: 'Europe/Vienna', historyEnabled: true,
      historyIntervalMinutes: 30, historyIntervalUnit: 'minutes' as const};
    const saving = service.updateUser(draft);
    draft.timezone = 'Europe/London'; draft.historyIntervalMinutes = 90; draft.enabled = false;
    expect(rpc).not.toHaveBeenCalled();
    client.resolve({rpc}); await saving;
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_update_sync_user', expect.objectContaining({
      p_user_id: 'user-a', p_enabled: true, p_timezone: 'Europe/Vienna',
      p_history_enabled: true, p_history_interval_minutes: 30, p_history_interval_unit: 'minutes'
    }));
    expect(draft.timezone).toBe('Europe/London');
    expect(draft.historyIntervalMinutes).toBe(90);
  });

  it('keeps policy values selected at activation while the client becomes ready', async () => {
    const client = deferred<any>(); getClient.mockReturnValueOnce(client.promise);
    const draft = {taskKey: 'stats_short_term' as const, available: true, intervalValue: 2, intervalUnit: 'hours' as const};
    const saving = service.updateSyncSchedulePolicy(draft);
    draft.intervalValue = 7; draft.available = false;
    client.resolve({rpc}); await saving;
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_update_sync_schedule_policy', {
      p_task_key: 'stats_short_term', p_available: true, p_interval_value: 2, p_interval_unit: 'hours'
    });
    expect(draft.intervalValue).toBe(7);
  });

  it('saves the selected announcement without consuming subsequent website edits', async () => {
    const client = deferred<any>(); getClient.mockReturnValueOnce(client.promise);
    const draft = {announcement: 'Scheduled maintenance', allowSongLeagueCreation: false};
    const saving = service.updateSiteSettings(draft);
    draft.announcement = 'Next unsaved draft'; draft.allowSongLeagueCreation = true;
    client.resolve({rpc}); await saving;
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_update_site_settings', {
      p_announcement: 'Scheduled maintenance', p_allow_song_league_creation: false
    });
    expect(draft.announcement).toBe('Next unsaved draft');
  });

  it('submits exactly the moderation decision activated before client readiness', async () => {
    const client = deferred<any>(); getClient.mockReturnValueOnce(client.promise);
    const draft = {reportId: 'report-a', status: 'resolved_no_action', outcome: 'no_violation',
      decisionReason: 'Reviewed context', reporterNotice: 'No violation found', affectedNotice: 'Review complete'} as AdminModerationReport;
    const saving = service.updateModerationReport(draft);
    draft.decisionReason = 'Unsaved follow-up'; draft.reporterNotice = 'Do not send yet'; draft.affectedNotice = '';
    client.resolve({rpc}); await saving;
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_update_moderation_report', {
      p_report_id: 'report-a', p_status: 'resolved_no_action', p_outcome: 'no_violation',
      p_decision_reason: 'Reviewed context', p_reporter_notice: 'No violation found', p_affected_notice: 'Review complete'
    });
    expect(draft.reporterNotice).toBe('Do not send yet');
  });

  it.each(['admin_list_users', 'admin_list_schedule_status', 'admin_list_required_sync_reasons'])(
    'rejects the entire user inventory when %s fails, then permits a fresh retry', async failedRpc => {
      rpc.mockImplementation(async name => ({data: name === 'admin_list_users' ? [{user_id: 'user-a'}] : [], error: name === failedRpc ? denied : null}));
      await expect(service.listUsers()).rejects.toBe(denied);
      expect(rpc).toHaveBeenCalledTimes(3);
      rpc.mockResolvedValue({data: [], error: null});
      await expect(service.listUsers()).resolves.toEqual([]);
      expect(rpc).toHaveBeenCalledTimes(6);
    });

  it('joins summaries by identity rather than response order and retains missing schedule defaults', async () => {
    rpc.mockImplementation(async name => ({data: name === 'admin_list_users' ? [{user_id: 'user-a'}, {user_id: 'user-b'}] :
      name === 'admin_list_schedule_status' ? [{user_id: 'user-b', next_effective_run_at: '2026-11-01T00:00:00Z', manual_job_retained: true}] :
        [{user_id: 'user-b', required_tasks: {shared_playlists: 'Owned playlist'}}], error: null}));
    const [a, b] = await service.listUsers();
    expect(a).toMatchObject({userId: 'user-a', timezone: 'Europe/Vienna', backupActive: false,
      hasRefreshToken: false, historyIntervalMinutes: 60, shortTermIntervalHours: 24,
      mediumTermIntervalHours: 168, longTermIntervalHours: 168, songLeaguePlaylistFridaysOnly: true,
      sharedPlaylistIntervalMinutes: 60, nextEffectiveRunAt: null, manualJobRetained: false, requiredTasks: {}});
    expect(b).toMatchObject({userId: 'user-b', nextEffectiveRunAt: '2026-11-01T00:00:00Z',
      manualJobRetained: true, requiredTasks: {shared_playlists: 'Owned playlist'}});
  });

  it('preserves disabled policy and parses a serialized minimum interval without changing units', async () => {
    rpc.mockResolvedValue({data: [{task_key: 'listening_history', available: false, minimum_interval_minutes: '90'},
      {task_key: 'stats_short_term', available: null, minimum_interval_minutes: null}], error: null});
    await expect(service.loadSyncSchedulePolicy()).resolves.toEqual([
      {taskKey: 'listening_history', available: false, intervalValue: 90, intervalUnit: 'minutes'},
      {taskKey: 'stats_short_term', available: true, intervalValue: 1, intervalUnit: 'minutes'}]);
    await service.updateSyncSchedulePolicy({taskKey: 'listening_history', available: false, intervalValue: 2, intervalUnit: 'days'});
    expect(rpc).toHaveBeenLastCalledWith('admin_update_sync_schedule_policy', {
      p_task_key: 'listening_history', p_available: false, p_interval_value: 2, p_interval_unit: 'days'});
  });

  it('defaults missing public settings but preserves an explicit creation prohibition', async () => {
    await expect(service.loadSiteSettings()).resolves.toEqual({announcement: '', allowSongLeagueCreation: true});
    rpc.mockResolvedValue({data: [{announcement: '', allow_song_league_creation: false}], error: null});
    await expect(service.loadSiteSettings()).resolves.toEqual({announcement: '', allowSongLeagueCreation: false});
    await service.updateSiteSettings({announcement: 'Maintenance', allowSongLeagueCreation: false});
    expect(rpc).toHaveBeenLastCalledWith('admin_update_site_settings', {p_announcement: 'Maintenance', p_allow_song_league_creation: false});
  });

  it('keeps required feature tasks when optional schedules are disabled, without enabling unrelated history', async () => {
    rpc.mockResolvedValue({data: '3', error: null});
    await expect(service.enqueueUser(user)).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_enqueue_sync', {p_user_id: 'user-a',
      p_task_keys: ['stats_short_term', 'song_league_playlists', 'shared_playlists']});
  });

  it('does not duplicate an enabled feature task that is also required', async () => {
    await service.enqueueUser({...user, historyEnabled: true, shortTermEnabled: true, mediumTermEnabled: true,
      longTermEnabled: true, songLeaguePlaylistsEnabled: true, sharedPlaylistsEnabled: true});
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_enqueue_sync', {p_user_id: 'user-a', p_task_keys:
      ['listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term', 'song_league_playlists', 'shared_playlists']});
  });

  it('requires literal review eligibility and filters malformed blockers before presenting them', async () => {
    rpc.mockResolvedValue({data: {eligible: 'true', spotifyId: 'pending_spotify', createdAt: '2026-10-20', blockers: ['Active membership', null, 3]}, error: null});
    await expect(service.reviewPendingProfile('pending-user')).resolves.toEqual({eligible: false,
      spotifyId: 'pending_spotify', createdAt: '2026-10-20', blockers: ['Active membership']});
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_review_pending_spotify_profile', {p_user_id: 'pending-user'});
  });

  it('handles a missing pending profile without inventing deletion eligibility', async () => {
    await expect(service.reviewPendingProfile('gone-user')).resolves.toEqual({eligible: false, spotifyId: '', createdAt: '', blockers: []});
    await service.deleteReviewedPendingProfile('pending-user', 'reviewed-spotify-id');
    expect(rpc).toHaveBeenLastCalledWith('admin_delete_reviewed_pending_spotify_profile', {
      p_user_id: 'pending-user', p_expected_spotify_id: 'reviewed-spotify-id'});
  });

  it.each([
    ['site settings', (s: AdminService) => s.loadSiteSettings()],
    ['site settings update', (s: AdminService) => s.updateSiteSettings({announcement: '', allowSongLeagueCreation: false})],
    ['policy inventory', (s: AdminService) => s.loadSyncSchedulePolicy()],
    ['policy update', (s: AdminService) => s.updateSyncSchedulePolicy({taskKey: 'listening_history', available: false, intervalValue: 1, intervalUnit: 'days'})],
    ['user update', (s: AdminService) => s.updateUser(user)],
    ['pending profile review', (s: AdminService) => s.reviewPendingProfile('user-a')],
    ['reviewed deletion', (s: AdminService) => s.deleteReviewedPendingProfile('user-a', 'expected-id')],
    ['manual queue', (s: AdminService) => s.enqueueUser(user)],
    ['run inventory', (s: AdminService) => s.listRuns()],
    ['moderation inbox', (s: AdminService) => s.listModerationReports()],
    ['moderation decision', (s: AdminService) => s.updateModerationReport({reportId: 'report-a', status: 'under_review'} as AdminModerationReport)],
    ['demo creation', (s: AdminService) => s.createDemoLeague('Demo', 'Europe/Vienna')]
  ] as const)('propagates denied %s without retrying or substituting success', async (_name, operation) => {
    rpc.mockResolvedValue({data: null, error: denied});
    await expect(operation(service)).rejects.toBe(denied);
    expect(rpc).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects an empty demo response and submits the chosen timezone unchanged', async () => {
    await expect(service.createDemoLeague('DST demo', 'America/New_York')).rejects.toThrow('The demo league was not created.');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_create_demo_league', {p_name: 'DST demo', p_timezone: 'America/New_York'});
  });

  it('preserves run failure details and forwards an explicit inventory limit', async () => {
    rpc.mockResolvedValue({data: [{id: 'run-a', user_id: 'user-a', task_key: 'listening_history', status: 'failed',
      requested_at: '2026-10-20', error: 'Provider unavailable', details: {retryable: true}}], error: null});
    const [run] = await service.listRuns(7);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_list_sync_runs', {p_limit: 7});
    expect(run).toMatchObject({id: 'run-a', status: 'failed', startedAt: null, finishedAt: null,
      error: 'Provider unavailable', details: {retryable: true}});
  });

  it('distinguishes transport denial from a function-level notification error without another delivery attempt', async () => {
    invoke.mockResolvedValueOnce({data: null, error: denied});
    await expect(service.sendTestNotification()).rejects.toBe(denied);
    invoke.mockResolvedValueOnce({data: {error: 'No eligible subscription'}, error: null});
    await expect(service.sendTestNotification()).rejects.toThrow('No eligible subscription');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not let an old resolved admin check overwrite the replacement identity cache', async () => {
    const old = deferred<{data: boolean; error: null}>();
    rpc.mockReturnValueOnce(old.promise).mockResolvedValue({data: false, error: null});
    const original = service.isAdmin();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    identity = 'admin-b';
    expect(await service.isAdmin()).toBe(false);
    old.resolve({data: true, error: null});
    expect(await original).toBe(false);
    expect(await service.isAdmin()).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not start a privileged check for an identity that left while client readiness was pending', async () => {
    const ready = deferred<{rpc: typeof rpc}>();
    getClient.mockReturnValueOnce(ready.promise);
    const pending = service.isAdmin();
    identity = null;
    expect(await service.isAdmin()).toBe(false);
    ready.resolve({rpc});
    expect(await pending).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects an outgoing admin result after logout while its trusted RPC is pending', async () => {
    const old = deferred<{data: boolean; error: null}>();
    rpc.mockReturnValue(old.promise);
    const pending = service.isAdmin();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    identity = null;
    expect(await service.isAdmin()).toBe(false);
    old.resolve({data: true, error: null});
    expect(await pending).toBe(false);
  });

  it('rejects a previous session result even when the same cloud identity signs in again', async () => {
    const old = deferred<{data: boolean; error: null}>();
    rpc.mockReturnValueOnce(old.promise).mockResolvedValue({data: false, error: null});
    const previousSession = service.isAdmin();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    identity = null;
    expect(await service.isAdmin()).toBe(false);
    identity = 'admin-a';
    expect(await service.isAdmin()).toBe(false);
    old.resolve({data: true, error: null});
    expect(await previousSession).toBe(false);
    expect(await service.isAdmin()).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
