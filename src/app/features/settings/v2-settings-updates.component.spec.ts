import {TestBed} from '@angular/core/testing';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SyncTaskStatus} from '@core/sync/sync-schedule-policy';
import {V2SettingsUpdateEditorComponent, V2SettingsUpdatesComponent} from './v2-settings-updates.component';

const history: SyncTaskStatus = {task_key: 'listening_history', optional_enabled: false, feature_required: false,
  effective_active: false, editable: true, reasons: ['Disabled by you'], interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60, policy_available: true};
const rows = [history, {...history, task_key: 'stats_short_term', feature_required: true, effective_active: true},
  {...history, task_key: 'stats_medium_term', policy_available: false}, {...history, task_key: 'shared_playlists', editable: false}];
async function setup(path = '/settings/updates') {
  let schedules = rows.map(row => ({...row})); let fail = false;
  const rpc = vi.fn((name: string, params?: Record<string, unknown>) => ({abortSignal: async () => {
    if (name === 'update_my_sync_schedule_preference') {
      if (fail) {fail = false; return {data: null, error: new Error('Save rejected')};}
      schedules = schedules.map(row => row.task_key === params?.['p_task_key'] ? {...row, optional_enabled: params['p_enabled'] as boolean,
        interval_value: params['p_interval_value'] as number, interval_unit: params['p_interval_unit'] as 'hours'} : row);
    }
    return {data: schedules, error: null};
  }}));
  TestBed.configureTestingModule({providers: [provideRouter([
    {path: 'settings/updates/:id', component: V2SettingsUpdateEditorComponent}, {path: 'settings/updates', component: V2SettingsUpdatesComponent}
  ]), {provide: SupabaseService, useValue: {getClient: async () => ({rpc})}},
    {provide: SpotifyAuthService, useValue: {getUserId: () => 'actor-a', getSupabaseUserId: () => 'cloud-a'}}]});
  const harness = await RouterTestingHarness.create(path); await harness.fixture.whenStable(); harness.fixture.detectChanges();
  const panel = () => harness.fixture.nativeElement as HTMLElement;
  const settle = async () => {await harness.fixture.whenStable(); harness.fixture.detectChanges();};
  return {harness, panel, rpc, settle, failNext: () => {fail = true;}};
}
describe('canonical Updates routes and draft editor', () => {
  it('links only editable tasks and accurately distinguishes Required, Unavailable and inactive feature-owned schedules', async () => {
    const s = await setup();
    expect(s.panel().querySelector('a[href="/settings/updates/listening_history"]')).not.toBeNull();
    expect(s.panel().querySelectorAll('.v2-update-summary')).toHaveLength(4);
    expect(s.panel().querySelector('a[href="/settings/updates/stats_short_term"]')).toBeNull();
    expect(s.panel().textContent).toContain('Required'); expect(s.panel().textContent).toContain('Unavailable');
    expect(s.panel().querySelector('[data-task="shared_playlists"]')?.textContent).toContain('Disabled');
  });
  it('changes a draft with the switch, saves explicitly, and discards later unsaved edits through Back', async () => {
    const s = await setup('/settings/updates/listening_history');
    const control = s.panel().querySelector('[role="switch"]') as HTMLInputElement;
    expect(control.checked).toBe(false); control.click(); await s.settle(); expect(control.checked).toBe(true);
    expect(s.rpc.mock.calls.some(call => call[0] === 'update_my_sync_schedule_preference')).toBe(false);
    (s.panel().querySelector('.v2-update-save') as HTMLButtonElement).click(); await s.settle();
    expect(s.panel().textContent).toContain('Automatic updates saved');
    control.click(); await s.settle(); (s.panel().querySelector('.v2-page__back') as HTMLButtonElement).click(); await s.settle();
    expect(TestBed.inject(Router).url).toBe('/settings/updates');
    await s.harness.navigateByUrl('/settings/updates/listening_history'); await s.settle();
    expect((s.panel().querySelector('[role="switch"]') as HTMLInputElement).checked).toBe(true);
  });
  it('keeps a rejected save draft for retry without reporting success', async () => {
    const s = await setup('/settings/updates/listening_history'); s.failNext();
    (s.panel().querySelector('.v2-update-save') as HTMLButtonElement).click(); await s.settle();
    expect(s.panel().querySelector('[role="alert"]')?.textContent).toContain('Save rejected');
    expect(s.panel().textContent).not.toContain('Automatic updates saved');
    (s.panel().querySelector('.v2-update-save') as HTMLButtonElement).click(); await s.settle(); expect(s.panel().textContent).toContain('Automatic updates saved');
  });
  it.each(['stats_short_term', 'stats_medium_term', 'unknown'])('never mounts write controls for %s', async id => {
    const s = await setup('/settings/updates/' + id); expect(s.panel().querySelector('[role="switch"]')).toBeNull();
    expect(s.panel().querySelector('.v2-update-save')).toBeNull(); expect(s.rpc.mock.calls.every(call => call[0] === 'get_my_sync_task_status')).toBe(true);
  });
});
