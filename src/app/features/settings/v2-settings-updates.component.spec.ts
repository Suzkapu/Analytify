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
async function setup(path = '/settings/updates', initialRows = rows) {
  let schedules = initialRows.map(row => ({...row})); let fail = false;
  let pendingRead: Promise<{data: SyncTaskStatus[] | null; error: Error | null}> | null = null;
  const rpc = vi.fn((name: string, params?: Record<string, unknown>) => ({abortSignal: async () => {
    if (name === 'get_my_sync_task_status' && pendingRead) {const read = pendingRead; pendingRead = null; return read;}
    if (name === 'update_my_sync_schedule_preference') {
      if (fail) {fail = false; return {data: null, error: new Error('Save rejected')};}
      schedules = schedules.map(row => row.task_key === params?.['p_task_key'] ? {...row, optional_enabled: params['p_enabled'] as boolean,
        interval_value: params['p_interval_value'] as number, interval_unit: params['p_interval_unit'] as 'hours'} : row);
    }
    return {data: schedules, error: null};
  }}));
  TestBed.configureTestingModule({providers: [provideRouter([
    {path: 'settings/updates/:id', component: V2SettingsUpdateEditorComponent}, {path: 'settings/updates', component: V2SettingsUpdatesComponent},
    {path: 'settings/update-missing-id', component: V2SettingsUpdateEditorComponent}
  ]), {provide: SupabaseService, useValue: {getClient: async () => ({rpc})}},
    {provide: SpotifyAuthService, useValue: {getUserId: () => 'actor-a', getSupabaseUserId: () => 'cloud-a'}}]});
  const harness = await RouterTestingHarness.create(path); await harness.fixture.whenStable(); harness.fixture.detectChanges();
  const panel = () => harness.fixture.nativeElement as HTMLElement;
  const settle = async () => {await harness.fixture.whenStable(); harness.fixture.detectChanges();};
  return {harness, panel, rpc, settle, failNext: () => {fail = true;}, holdNextRead: () => {
    let finish!: (result: {data: SyncTaskStatus[] | null; error: Error | null}) => void;
    pendingRead = new Promise(resolve => {finish = resolve;}); return finish;
  }};
}
describe('canonical Updates routes and draft editor', () => {
  it('renders an unknown noneditable schedule without inventing an icon or identity', async () => {
    const s = await setup('/settings/updates', [{...history, task_key: 'future_schedule', editable: false}]);
    expect(s.panel().querySelector('.v2-update-summary strong')?.textContent).toBe('Automatic update');
    expect(s.panel().querySelector('.v2-update-summary img')).toBeNull();
    expect(s.panel().querySelector('a.v2-update-summary')).toBeNull();
  });
  it('does not invent write controls when an editor is mounted without a task ID', async () => {
    const s = await setup('/settings/update-missing-id');
    expect(s.panel().textContent).toContain('This update is unavailable'); expect(s.panel().querySelector('[role="switch"]')).toBeNull();
  });
  it('refreshes on returning to the window, preserving cached rows through pending and failed reads', async () => {
    const s = await setup(); const finish = s.holdNextRead();
    window.dispatchEvent(new Event('focus')); s.harness.fixture.detectChanges();
    expect(s.panel().textContent).toContain('Refreshing automatic updates');
    expect(s.panel().querySelectorAll('.v2-update-summary')).toHaveLength(4);
    finish({data: null, error: new Error('Refresh unavailable')}); await s.settle();
    expect(s.panel().querySelector('[role="alert"]')?.textContent).toContain('Refresh unavailable');
    expect(s.panel().querySelectorAll('.v2-update-summary')).toHaveLength(4);
    (s.panel().querySelector('v2-inline-status button') as HTMLButtonElement).click(); await s.settle();
    expect(s.panel().querySelector('[role="alert"]')).toBeNull();
  });
  it('closes a popup when a refreshed policy locks the task, without reviving it if the task becomes editable again', async () => {
    const s = await setup('/settings/updates/listening_history');
    (s.panel().querySelector('.v2-update-field') as HTMLButtonElement).click(); await s.settle();
    const finish = s.holdNextRead(); window.dispatchEvent(new Event('focus')); s.harness.fixture.detectChanges();
    expect(s.panel().textContent).toContain('Refreshing automatic updates');
    finish({data: [{...history, feature_required:true}], error: null}); await s.settle();
    expect(s.panel().querySelector('[role="dialog"]')).toBeNull(); expect(s.panel().querySelector('[role="switch"]')).toBeNull();
    window.dispatchEvent(new Event('focus')); await s.settle();
    expect(s.panel().querySelector('[role="switch"]')).not.toBeNull(); expect(s.panel().querySelector('[role="dialog"]')).toBeNull();
  });
  it('identifies a failed editor refresh as a read failure while retaining the unsaved draft', async () => {
    const s = await setup('/settings/updates/listening_history');
    (s.panel().querySelector('[role="switch"]') as HTMLInputElement).click(); await s.settle();
    const finish = s.holdNextRead(); window.dispatchEvent(new Event('focus')); s.harness.fixture.detectChanges();
    finish({data:null,error:new Error('Schedule read failed')}); await s.settle();
    expect(s.panel().querySelector('[role="alert"]')?.textContent).toContain('Automatic updates could not be loaded');
    expect((s.panel().querySelector('[role="switch"]') as HTMLInputElement).checked).toBe(true);
    expect(s.panel().textContent).not.toContain('Changes could not be saved');
    (s.panel().querySelector('v2-inline-status button') as HTMLButtonElement).click(); await s.settle();
    expect(s.panel().querySelector('[role="alert"]')).toBeNull();
    expect((s.panel().querySelector('[role="switch"]') as HTMLInputElement).checked).toBe(true);
    expect(s.rpc.mock.calls.every(call => call[0] === 'get_my_sync_task_status')).toBe(true);
  });
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
  it('drops the previous task draft when navigating between editor routes that reuse the component', async () => {
    const s = await setup('/settings/updates/listening_history');
    (s.panel().querySelector('[role="switch"]') as HTMLInputElement).click(); await s.settle();
    await s.harness.navigateByUrl('/settings/updates/stats_short_term'); await s.settle();
    expect(s.panel().querySelector('[role="switch"]')).toBeNull();
    expect(s.panel().querySelector('h1')?.textContent).toBe('Short-term stats');
    expect(s.panel().textContent).toContain('This update is required');
    expect(s.rpc.mock.calls.every(call => call[0] === 'get_my_sync_task_status')).toBe(true);
  });
  it('cancels popup input, resets it on reopening, validates it, and saves only the applied draft', async () => {
    const s = await setup('/settings/updates/listening_history');
    const every = () => s.panel().querySelector('.v2-update-field') as HTMLButtonElement;
    const button = (label: string) => [...s.panel().querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent?.trim() === label)!;
    const fill = async (value: string) => {const input = s.panel().querySelector('input[type="number"]') as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input')); await s.settle();};
    every().click(); await s.settle(); await fill('4'); button('Cancel').click(); await s.settle();
    expect(every().textContent).toContain('2'); every().click(); await s.settle();
    expect((s.panel().querySelector('input[type="number"]') as HTMLInputElement).value).toBe('2');
    await fill('1.5'); button('Apply').click(); await s.settle();
    expect(s.panel().querySelector('[role="alert"]')?.textContent).toContain('whole-number');
    await fill('4'); button('Apply').click(); await s.settle(); expect(every().textContent).toContain('4');
    (s.panel().querySelectorAll('.v2-update-field')[1] as HTMLButtonElement).click(); await s.settle(); button('days').click(); await s.settle();
    expect(s.panel().querySelectorAll('.v2-update-field')[1].textContent).toContain('days');
    expect(s.rpc.mock.calls.every(call => call[0] === 'get_my_sync_task_status')).toBe(true);
    (s.panel().querySelector('.v2-update-save') as HTMLButtonElement).click(); await s.settle();
    expect(s.rpc.mock.calls.filter(call => call[0] === 'update_my_sync_schedule_preference')).toEqual([
      ['update_my_sync_schedule_preference', {p_task_key: 'listening_history', p_enabled: false, p_interval_value: 4, p_interval_unit: 'days'}]
    ]);
  });
});
