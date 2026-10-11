import {Injectable, OnDestroy, computed, inject, signal} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {PushNotificationService, PushNotificationSettings} from '@core/notifications/push-notification.service';

interface NotificationRequest {
  revision: number;
  actor: string | null;
  cloud: string | null;
  generation: SessionGeneration;
}

/** State for the canonical page; device registration and category saving are separate actions. */
@Injectable()
export class V2NotificationSettingsController implements OnDestroy {
  private readonly cachedSettings = signal<{value: PushNotificationSettings; owner: Pick<NotificationRequest, 'actor' | 'cloud' | 'generation'>} | null>(null);
  readonly settings = computed(() => this.cachedSettings()?.value ?? null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly savingDevice = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  private readonly notifications = inject(PushNotificationService);
  private readonly auth = inject(SpotifyAuthService);
  private readonly lifecycle = inject(SessionLifecycleService);
  private revision = 0;
  private destroyed = false;

  async reload(): Promise<void> {
    if (this.saving() || this.destroyed) return;
    const cached = this.cachedSettings();
    if (cached && !this.ownerCurrent(cached.owner)) this.clearSettings();
    await this.run(() => this.notifications.loadSettings(), false);
  }

  async enableDevice(): Promise<void> {
    const settings = this.mutationSettings();
    if (!settings || settings.deviceState === 'denied' || settings.deviceState === 'unsupported') return;
    await this.run(() => this.notifications.enableDevice(), true, true);
  }

  async setCategory(category: 'song_league' | 'song_league_song_added' | 'stats_access_requests', enabled: boolean): Promise<void> {
    if (!this.mutationSettings()) return;
    await this.run(() => this.notifications.setCategoryPreference(category, enabled), true);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revision++;
  }

  private current(request: NotificationRequest): boolean {
    return !this.destroyed && request.revision === this.revision
      && this.ownerCurrent(request);
  }

  private ownerCurrent(owner: Pick<NotificationRequest, 'actor' | 'cloud' | 'generation'>): boolean {
    return owner.actor === this.auth.getUserId() && owner.cloud === this.auth.getSupabaseUserId()
      && this.lifecycle.isCurrent(owner.generation);
  }

  private clearSettings(): void {
    this.cachedSettings.set(null); this.error.set(''); this.message.set('');
  }

  private mutationSettings(): PushNotificationSettings | null {
    if (this.loading() || this.saving() || this.destroyed) return null;
    const cached = this.cachedSettings();
    if (!cached) return null;
    if (!this.ownerCurrent(cached.owner)) {this.clearSettings(); return null;}
    return cached.value;
  }

  private async run(action: () => Promise<PushNotificationSettings>, mutation: boolean, device = false): Promise<void> {
    const request: NotificationRequest = {revision: ++this.revision, actor: this.auth.getUserId(), cloud: this.auth.getSupabaseUserId(), generation: this.lifecycle.capture()};
    this.loading.set(!mutation); this.saving.set(mutation); this.error.set(''); this.message.set('');
    this.savingDevice.set(device);
    try {
      const settings = await action();
      if (this.current(request)) {
        this.cachedSettings.set({value: settings, owner: request});
        if (mutation) this.message.set('Notification settings saved.');
      }
    } catch (error) {
      if (this.current(request)) this.error.set((error as {message?: string} | null)?.message || 'Notification settings could not be updated. Try again.');
    } finally {
      if (!this.destroyed && request.revision === this.revision) {
        if (!this.current(request)) this.clearSettings();
        this.loading.set(false); this.saving.set(false); this.savingDevice.set(false);
      }
    }
  }
}
