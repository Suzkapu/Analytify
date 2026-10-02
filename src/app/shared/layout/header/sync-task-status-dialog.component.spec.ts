import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SyncTaskStatusDialogComponent} from './sync-task-status-dialog.component';

describe('SyncTaskStatusDialogComponent', () => {
  let fixture: ComponentFixture<SyncTaskStatusDialogComponent>;
  let component: SyncTaskStatusDialogComponent;
  let rpc: ReturnType<typeof vi.fn>;
  let getClient: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    rpc = vi.fn().mockResolvedValue({data: [
      {
        task_key: 'listening_history', optional_enabled: false, feature_required: false,
        effective_active: false, reasons: ['Disabled by you'], editable: true,
        interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 60,
        policy_available: true
      },
      {
        task_key: 'shared_playlists', optional_enabled: false, feature_required: true,
        effective_active: true, reasons: ['Active because you publish an auto-updating shared playlist'],
        editable: false, interval_value: 60, interval_unit: 'minutes',
        minimum_interval_minutes: 1, policy_available: true
      },
      {
        task_key: 'stats_long_term', optional_enabled: false, feature_required: false,
        effective_active: false, reasons: ['Unavailable by policy'], editable: true,
        interval_value: 7, interval_unit: 'days', minimum_interval_minutes: 10080,
        policy_available: false
      }
    ], error: null});
    getClient = vi.fn().mockResolvedValue({rpc});
    await TestBed.configureTestingModule({
      imports: [SyncTaskStatusDialogComponent],
      providers: [{provide: SupabaseService, useValue: {client: {rpc}, getClient}}]
    }).compileComponents();
    fixture = TestBed.createComponent(SyncTaskStatusDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('waits for client readiness before saving an editable task', async () => {
    let ready!: (client: any) => void;
    getClient.mockReturnValue(new Promise(resolve => { ready = resolve; }));
    rpc.mockClear();
    const pending = component.save(component.tasks[0]);
    expect(rpc).not.toHaveBeenCalled();
    expect(component.savingTask).toBe('listening_history');
    ready({rpc});
    await pending;
    expect(rpc.mock.calls.map(call => call[0])).toEqual([
      'update_my_sync_schedule_preference', 'get_my_sync_task_status'
    ]);
    expect(component.savedTask).toBe('listening_history');
  });

  it('shows client initialization errors without sending a preference update', async () => {
    getClient.mockRejectedValue(new Error('Client unavailable'));
    rpc.mockClear();
    await component.save(component.tasks[0]);
    expect(component.error).toBe('Client unavailable');
    expect(component.savingTask).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('offers controls only for personal tasks and shows feature tasks as locked', () => {
    expect(fixture.nativeElement.querySelectorAll('.sync-task-editor')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Required');
    expect(fixture.nativeElement.textContent).toContain('Unavailable');
    expect(component.minimumFor(component.tasks[0], 'hours')).toBe(1);
    expect(component.minimumLabel(component.tasks[2])).toBe('7 days');
    const icons = fixture.nativeElement.querySelectorAll('.pi') as NodeListOf<HTMLElement>;
    expect(icons.length).toBeGreaterThan(0);
    expect([...icons].every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('expands only one editable schedule at a time', () => {
    const first = component.tasks[0];
    component.toggleExpanded(first);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.sync-task-editor')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.sync-task-editor')?.textContent).toContain('Minimum interval: 1 hour');
    component.toggleExpanded(first);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.sync-task-editor')).toHaveLength(0);
  });

  it('never opens an editor for required or policy-unavailable tasks', () => {
    component.toggleExpanded(component.tasks[1]);
    component.toggleExpanded(component.tasks[2]);
    expect(component.expandedTask).toBeNull();
  });

  it('persists the selected unit and interval through the constrained RPC', async () => {
    const task = component.tasks[0];
    task.optional_enabled = true;
    task.interval_value = 3;
    task.interval_unit = 'days';
    await component.save(task);

    expect(rpc).toHaveBeenCalledWith('update_my_sync_schedule_preference', {
      p_task_key: 'listening_history', p_enabled: true,
      p_interval_value: 3, p_interval_unit: 'days'
    });
    expect(component.savedTask).toBe('listening_history');
  });

  it('associates minimum validation with the interval field and does not save', async () => {
    const task = component.tasks[0];
    task.optional_enabled = true;
    task.interval_value = 0;
    component.toggleExpanded(task);
    rpc.mockClear();
    await component.save(task);
    fixture.detectChanges();
    const error = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    const input = fixture.nativeElement.querySelector('.sync-interval-fieldset input') as HTMLInputElement;
    expect(error.textContent).toContain('Choose at least 1 hour');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(rpc).not.toHaveBeenCalled();
  });
});
