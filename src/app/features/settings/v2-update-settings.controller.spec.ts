import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SyncTaskStatus} from '@core/sync/sync-schedule-policy';
import {V2UpdateSettingsController} from './v2-update-settings.controller';

const task: SyncTaskStatus = {task_key: 'listening_history', optional_enabled: true, feature_required: false,
  effective_active: true, editable: true, reasons: [], interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 61, policy_available: true};
function deferred<T>() {let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
function setup() {
  let actor = 'actor-a'; let cloud = 'cloud-a'; let rows: SyncTaskStatus[] | null = [task];
  const signals: AbortSignal[] = [];
  const response = vi.fn(async (name: string, params?: Record<string, unknown>) => {
    if (name === 'update_my_sync_schedule_preference') rows = rows?.map(row => row.task_key === params?.['p_task_key']
      ? {...row, optional_enabled: params['p_enabled'] as boolean, interval_value: params['p_interval_value'] as number, interval_unit: params['p_interval_unit'] as 'hours'} : row) ?? null;
    return {data: rows, error: null};
  });
  const rpc = vi.fn((name: string, params?: Record<string, unknown>) => ({abortSignal: (signal: AbortSignal) => {signals.push(signal); return response(name, params);}}));
  const client = {rpc}; const getClient = vi.fn().mockResolvedValue(client);
  TestBed.configureTestingModule({providers: [V2UpdateSettingsController,
    {provide: SupabaseService, useValue: {getClient}},
    {provide: SpotifyAuthService, useValue: {getUserId: () => actor, getSupabaseUserId: () => cloud}}]});
  const controller = TestBed.inject(V2UpdateSettingsController); controller.select('listening_history');
  return {controller, response, rpc, getClient, client, signals, lifecycle: TestBed.inject(SessionLifecycleService),
    rows: (next: SyncTaskStatus[] | null) => {rows = next;}, replaceActor: () => {actor = 'actor-b';}, replaceCloud: () => {cloud = 'cloud-b';}};
}

describe('automatic update drafts and constrained service effects', () => {
  it('loads a draft, changes it locally, and only persists on explicit Save', async () => {
    const {controller, response, rpc} = setup(); await controller.reload(); controller.changeDraft({enabled: false, value: 3, unit: 'days'});
    expect(response.mock.calls.map(call => call[0])).toEqual(['get_my_sync_task_status']);
    expect(controller.selected()?.interval_value).toBe(2); await controller.save();
    expect(rpc).toHaveBeenCalledWith('update_my_sync_schedule_preference', {p_task_key: 'listening_history', p_enabled: false, p_interval_value: 3, p_interval_unit: 'days'});
    expect(controller.selected()?.interval_value).toBe(3); expect(controller.saved()).toBe(true);
    expect(controller.draft()).toEqual({enabled: false, value: 3, unit: 'days'});
  });
  it.each([{feature_required: true}, {editable: false}, {policy_available: false}])('does not expose or write a protected task: %o', async changes => {
    const {controller, rpc, rows} = setup(); rows([{...task, ...changes}]); await controller.reload(); await controller.save();
    expect(controller.draft()).toBeNull(); expect(rpc).toHaveBeenCalledOnce();
  });
  it('handles an empty result or missing task without inventing an editable schedule', async () => {
    const {controller, rows} = setup(); rows(null); await controller.reload(); expect(controller.tasks()).toEqual([]); expect(controller.draft()).toBeNull();
    rows([task]); controller.select('unknown'); await controller.reload(); expect(controller.selected()).toBeNull(); expect(controller.draft()).toBeNull();
  });
  it('validates the current policy and keeps the unsaved draft after failure', async () => {
    const {controller, rpc} = setup(); await controller.reload(); controller.changeDraft({value: 1}); await controller.save();
    expect(controller.validation()).toBe('Choose at least 2 hours.'); expect(rpc).toHaveBeenCalledOnce();
    controller.changeDraft({value: 1.5}); await controller.save(); expect(controller.validation()).toContain('whole-number');
  });
  it('keeps a failed write draft for retry, then replaces it with authoritative readback', async () => {
    const {controller, response} = setup(); await controller.reload(); controller.changeDraft({value: 3});
    response.mockResolvedValueOnce({data: null, error: new Error('Write rejected')} as never); await controller.save();
    expect(controller.error()).toBe('Write rejected'); expect(controller.saved()).toBe(false); expect(controller.draft()?.value).toBe(3);
    await controller.save(); expect(controller.error()).toBe(''); expect(controller.saved()).toBe(true);
  });
  it('retains cached schedules and draft across a failed refresh, with usable generic errors', async () => {
    const {controller, response} = setup(); await controller.reload(); controller.changeDraft({value: 3});
    response.mockRejectedValueOnce(null); await controller.reload(); expect(controller.error()).toContain('could not be loaded');
    expect(controller.draft()?.value).toBe(3); expect(controller.tasks()).toEqual([task]); await controller.reload(); expect(controller.error()).toBe('');
    response.mockRejectedValueOnce(null); await controller.save(); expect(controller.error()).toContain('could not be saved');
  });
  it('keeps a draft when registration-equivalent preference success is followed by readback failure', async () => {
    const {controller, response} = setup(); await controller.reload(); controller.changeDraft({value: 3});
    response.mockResolvedValueOnce({data: null, error: null} as never).mockRejectedValueOnce(new Error('Readback failed'));
    await controller.save(); expect(controller.error()).toBe('Readback failed'); expect(controller.saved()).toBe(false); expect(controller.draft()?.value).toBe(3);
  });
  it('blocks duplicate Save, refresh and draft edits during a pending preference write', async () => {
    const {controller, response, rpc} = setup(); await controller.reload(); const pending = deferred<{data: SyncTaskStatus[]; error: null}>();
    response.mockReturnValueOnce(pending.promise); const save = controller.save(); await Promise.resolve();
    expect(controller.saving()).toBe(true); controller.changeDraft({value: 9}); await controller.save(); await controller.reload();
    expect(controller.draft()?.value).toBe(2); expect(rpc.mock.calls.filter(call => call[0] === 'update_my_sync_schedule_preference')).toHaveLength(1);
    pending.resolve({data: [task], error: null}); await save; expect(controller.saving()).toBe(false);
  });
  it('lets the newest refresh win and invalidates a draft when the policy becomes locked', async () => {
    const {controller, response, rows} = setup(); await controller.reload(); const pending = deferred<{data: SyncTaskStatus[]; error: null}>();
    response.mockReturnValueOnce(pending.promise); const old = controller.reload(); await Promise.resolve();
    rows([{...task, policy_available: false}]); await controller.reload(); pending.resolve({data: [task], error: null}); await old;
    expect(controller.selected()?.policy_available).toBe(false); expect(controller.draft()).toBeNull();
  });
  it.each(['spotify', 'cloud', 'generation', 'destroy'] as const)('prevents dispatch after client initialization outlives %s context', async change => {
    const s = setup(); await s.controller.reload(); const pending = deferred<typeof s.client>(); s.getClient.mockReturnValueOnce(pending.promise);
    s.rpc.mockClear(); const save = s.controller.save();
    if (change === 'spotify') s.replaceActor(); else if (change === 'cloud') s.replaceCloud(); else if (change === 'generation') await s.lifecycle.invalidateAndDrain(); else s.controller.ngOnDestroy();
    pending.resolve(s.client); await save; expect(s.rpc).not.toHaveBeenCalled(); expect(s.controller.saved()).toBe(false); expect(s.controller.error()).toBe('');
  });
  it('discards an in-flight result after navigation disposal and uses the generation abort signal', async () => {
    const s = setup(); const pending = deferred<{data: SyncTaskStatus[]; error: null}>(); s.response.mockReturnValueOnce(pending.promise);
    const load = s.controller.reload(); await Promise.resolve(); s.controller.ngOnDestroy(); pending.resolve({data: [task], error: null}); await load;
    expect(s.controller.tasks()).toBeNull(); expect(s.signals[0]).toBe(s.lifecycle.capture().signal);
    await s.controller.reload(); await s.controller.save(); s.controller.changeDraft({value: 4}); expect(s.rpc).toHaveBeenCalledOnce();
  });
});
