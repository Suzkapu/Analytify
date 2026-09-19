import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output} from '@angular/core';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SharedModule} from '../../shared.module';

type SyncTaskStatus = {
  task_key: string;
  optional_enabled: boolean;
  feature_required: boolean;
  effective_active: boolean;
  reasons: string[];
};

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

  constructor(
    private readonly supabase: SupabaseService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const {data, error} = await this.supabase.client.rpc('get_my_sync_task_status');
      if (error) throw error;
      this.tasks = (data || []) as SyncTaskStatus[];
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'Automatic data use could not be loaded.';
    } finally {
      this.loading = false;
      this.changeDetector.markForCheck();
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
