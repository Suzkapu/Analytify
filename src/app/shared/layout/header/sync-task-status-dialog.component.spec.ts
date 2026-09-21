import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SyncTaskStatusDialogComponent} from './sync-task-status-dialog.component';

describe('SyncTaskStatusDialogComponent', () => {
  let fixture: ComponentFixture<SyncTaskStatusDialogComponent>;
  let component: SyncTaskStatusDialogComponent;
  let rpc: ReturnType<typeof vi.fn>;

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
      }
    ], error: null});
    await TestBed.configureTestingModule({
      imports: [SyncTaskStatusDialogComponent],
      providers: [{provide: SupabaseService, useValue: {client: {rpc}}}]
    }).compileComponents();
    fixture = TestBed.createComponent(SyncTaskStatusDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('offers controls only for personal tasks and shows feature tasks as locked', () => {
    expect(fixture.nativeElement.querySelectorAll('.sync-preference-toggle')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.pi-lock')).toHaveLength(1);
    expect(component.minimumFor(component.tasks[0], 'hours')).toBe(1);
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
  });
});
