import {Injectable, OnDestroy, computed, inject, signal} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {scheduleEditable, scheduleValidation, SyncScheduleDraft, SyncTaskStatus} from '@core/sync/sync-schedule-policy';

interface UpdateRequest {revision: number; actor: string | null; cloudActor: string | null; generation: SessionGeneration;}

@Injectable()
export class V2UpdateSettingsController implements OnDestroy {
  readonly tasks = signal<SyncTaskStatus[] | null>(null);
  readonly taskKey = signal<string | null>(null);
  readonly selected = computed(() => this.tasks()?.find(task => task.task_key === this.taskKey()) ?? null);
  readonly draft = signal<SyncScheduleDraft | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly failedOperation = signal<'load' | 'save' | null>(null);
  readonly validation = signal('');
  readonly saved = signal(false);
  private readonly backend = inject(SupabaseService);
  private readonly auth = inject(SpotifyAuthService);
  private readonly lifecycle = inject(SessionLifecycleService);
  private revision = 0;
  private destroyed = false;

  select(taskKey: string): void {
    this.revision++; this.taskKey.set(taskKey); this.tasks.set(null); this.draft.set(null);
    this.loading.set(false); this.saving.set(false); this.error.set(''); this.failedOperation.set(null); this.validation.set(''); this.saved.set(false);
  }
  changeDraft(changes: Partial<SyncScheduleDraft>): void {
    const draft = this.draft();
    if (!draft || this.saving()) return;
    this.draft.set({...draft, ...changes}); this.validation.set(''); this.saved.set(false);
  }
  async reload(): Promise<void> {
    if (this.saving() || this.destroyed) return;
    const request = this.capture(); this.loading.set(true); this.error.set(''); this.failedOperation.set(null);
    try { await this.read(request); }
    catch (error) { if (this.current(request)) {this.failedOperation.set('load'); this.error.set(this.message(error, 'Automatic updates could not be loaded. Try again.'));} }
    finally { this.finish(request); }
  }
  async save(): Promise<void> {
    const task = this.selected(); const draft = this.draft();
    if (!task || !draft || !scheduleEditable(task) || this.saving() || this.loading() || this.destroyed) return;
    const validation = scheduleValidation(task, draft);
    this.validation.set(validation || ''); this.saved.set(false);
    if (validation) return;
    const request = this.capture(); const preference = {...draft};
    this.saving.set(true); this.error.set(''); this.failedOperation.set(null);
    try {
      const client = await this.backend.getClient();
      if (!this.current(request)) return;
      const {error} = await client.rpc('update_my_sync_schedule_preference', {p_task_key: task.task_key,
        p_enabled: preference.enabled, p_interval_value: preference.value, p_interval_unit: preference.unit}).abortSignal(request.generation.signal);
      if (error) throw error;
      await this.read(request, true);
      if (this.current(request)) this.saved.set(true);
    } catch (error) { if (this.current(request)) {this.failedOperation.set('save'); this.error.set(this.message(error, 'Your automatic update preference could not be saved. Try again.'));} }
    finally { this.finish(request); }
  }
  ngOnDestroy(): void { this.destroyed = true; this.revision++; }
  private capture(): UpdateRequest {
    return {revision: ++this.revision, actor: this.auth.getUserId(), cloudActor: this.auth.getSupabaseUserId(), generation: this.lifecycle.capture()};
  }
  private current(request: UpdateRequest): boolean {
    return !this.destroyed && request.revision === this.revision && request.actor === this.auth.getUserId()
      && request.cloudActor === this.auth.getSupabaseUserId() && this.lifecycle.isCurrent(request.generation);
  }
  private async read(request: UpdateRequest, replaceDraft = false): Promise<void> {
    const client = await this.backend.getClient();
    if (!this.current(request)) return;
    const {data, error} = await client.rpc('get_my_sync_task_status').abortSignal(request.generation.signal);
    if (error) throw error;
    if (!this.current(request)) return;
    this.tasks.set((data || []) as SyncTaskStatus[]);
    const task = this.selected();
    if (!task || !scheduleEditable(task)) this.draft.set(null);
    else if (replaceDraft || !this.draft()) this.draft.set({enabled: task.optional_enabled, value: task.interval_value, unit: task.interval_unit});
  }
  private finish(request: UpdateRequest): void {
    if (this.destroyed || request.revision !== this.revision) return;
    if (!this.current(request)) {this.tasks.set(null); this.draft.set(null); this.error.set(''); this.failedOperation.set(null); this.saved.set(false);}
    this.loading.set(false); this.saving.set(false);
  }
  private message(error: unknown, fallback: string): string { return (error as {message?: string} | null)?.message || fallback; }
}
