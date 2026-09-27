import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output} from '@angular/core';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SharedModule} from '../../shared.module';
import {humanInterval, syncTaskState} from './settings-sheet-view-model';

type SyncTaskStatus = {
  task_key: string;
  optional_enabled: boolean;
  feature_required: boolean;
  effective_active: boolean;
  reasons: string[];
  editable: boolean;
  interval_value: number;
  interval_unit: SyncIntervalUnit;
  minimum_interval_minutes: number;
  policy_available: boolean;
};

type SyncIntervalUnit = 'minutes' | 'hours' | 'days';

@Component({
  selector: 'app-sync-task-status-dialog',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './sync-task-status-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncTaskStatusDialogComponent implements OnInit {
  @Output() readonly closed = new EventEmitter<void>();

  tasks: SyncTaskStatus[] = [];
  error = '';
  loading = true;
  savingTask: string | null = null;
  savedTask: string | null = null;
  expandedTask: string | null = null;
  validationErrors: Record<string, string> = {};

  constructor(
    private readonly supabase: SupabaseService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.load();
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'Automatic updates could not be loaded.';
    } finally {
      this.loading = false;
      this.changeDetector.markForCheck();
    }
  }

  async save(task: SyncTaskStatus): Promise<void> {
    if (!task.editable || this.savingTask) return;
    this.error = '';
    this.savedTask = null;
    const minimum = this.minimumFor(task, task.interval_unit);
    if (!Number.isFinite(task.interval_value) || task.interval_value < minimum) {
      const unit = minimum === 1 ? task.interval_unit.replace(/s$/, '') : task.interval_unit;
      this.validationErrors[task.task_key] = `Choose at least ${minimum} ${unit}.`;
      this.changeDetector.markForCheck();
      return;
    }
    delete this.validationErrors[task.task_key];
    this.savingTask = task.task_key;
    try {
      const {error} = await this.supabase.client.rpc('update_my_sync_schedule_preference', {
        p_task_key: task.task_key,
        p_enabled: task.optional_enabled,
        p_interval_value: task.interval_value,
        p_interval_unit: task.interval_unit
      });
      if (error) throw error;
      await this.load();
      this.savedTask = task.task_key;
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'Your automatic update preference could not be saved.';
    } finally {
      this.savingTask = null;
      this.changeDetector.markForCheck();
    }
  }

  minimumFor(task: SyncTaskStatus, unit: SyncIntervalUnit): number {
    const divisor = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
    return Math.max(1, Math.ceil(task.minimum_interval_minutes / divisor));
  }

  minimumLabel(task: SyncTaskStatus): string {
    return humanInterval(task.minimum_interval_minutes);
  }

  stateFor(task: SyncTaskStatus) {
    return syncTaskState(task);
  }

  toggleExpanded(task: SyncTaskStatus): void {
    if (!this.stateFor(task).editable) return;
    this.expandedTask = this.expandedTask === task.task_key ? null : task.task_key;
    this.changeDetector.markForCheck();
  }

  close(): void {
    if (!this.savingTask) this.closed.emit();
  }

  private async load(): Promise<void> {
    const {data, error} = await this.supabase.client.rpc('get_my_sync_task_status');
    if (error) throw error;
    this.tasks = (data || []) as SyncTaskStatus[];
    if (this.expandedTask && !this.tasks.some(task => task.task_key === this.expandedTask && this.stateFor(task).editable)) {
      this.expandedTask = null;
    }
  }

  label(taskKey: string): string {
    return ({
      listening_history: 'Listening history',
      stats_short_term: 'Short-term stats',
      stats_medium_term: 'Medium-term stats',
      stats_long_term: 'Long-term stats',
      song_league_playlists: 'Weekly league playlists',
      shared_playlists: 'Shared playlists'
    } as Record<string, string>)[taskKey] || taskKey;
  }
}
