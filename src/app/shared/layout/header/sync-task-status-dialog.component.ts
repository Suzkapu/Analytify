import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output} from '@angular/core';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SharedModule} from '../../shared.module';

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

  constructor(
    private readonly supabase: SupabaseService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.load();
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'Automatic data use could not be loaded.';
    } finally {
      this.loading = false;
      this.changeDetector.markForCheck();
    }
  }

  async save(task: SyncTaskStatus): Promise<void> {
    if (!task.editable || this.savingTask) return;
    this.error = '';
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

  private async load(): Promise<void> {
    const {data, error} = await this.supabase.client.rpc('get_my_sync_task_status');
    if (error) throw error;
    this.tasks = (data || []) as SyncTaskStatus[];
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
