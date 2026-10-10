import {Injectable, OnDestroy, inject, signal} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {PushNotificationService, PushNotificationSettings} from '@core/notifications/push-notification.service';

interface NotificationRequest {
  revision: number;
  actor: string | null;
  generation: SessionGeneration;
}

/** State for the canonical page; device registration and category saving are separate actions. */
@Injectable()
export class V2NotificationSettingsController implements OnDestroy {
  readonly settings = signal<PushNotificationSettings | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  private readonly notifications = inject(PushNotificationService);
  private readonly auth = inject(SpotifyAuthService);
  private readonly lifecycle = inject(SessionLifecycleService);
  private revision = 0;
  private destroyed = false;

  async reload(): Promise<void> {
    if (this.saving() || this.destroyed) return;
    await this.run(() => this.notifications.loadSettings(), false);
  }

  async enableDevice(): Promise<void> {
    const settings = this.settings();
    if (!settings || settings.deviceState === 'denied' || settings.deviceState === 'unsupported') return;
    await this.run(() => this.notifications.enableDevice(), true);
  }

  async setCategory(category: 'song_league' | 'song_league_song_added' | 'stats_access_requests', enabled: boolean): Promise<void> {
    if (!this.settings()) return;
    await this.run(() => this.notifications.setCategoryPreference(category, enabled), true);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revision++;
  }

  private current(request: NotificationRequest): boolean {
    return !this.destroyed && request.revision === this.revision
      && request.actor === this.auth.getUserId() && this.lifecycle.isCurrent(request.generation);
  }

  private async run(action: () => Promise<PushNotificationSettings>, mutation: boolean): Promise<void> {
    if (this.saving() || this.destroyed) return;
    const request: NotificationRequest = {revision: ++this.revision, actor: this.auth.getUserId(), generation: this.lifecycle.capture()};
    this.loading.set(!mutation); this.saving.set(mutation); this.error.set(''); this.message.set('');
    try {
      const settings = await action();
      if (this.current(request)) {
        this.settings.set(settings);
        if (mutation) this.message.set('Notification settings saved.');
      }
    } catch (error) {
      if (this.current(request)) this.error.set((error as {message?: string} | null)?.message || 'Notification settings could not be updated. Try again.');
    } finally {
      if (!this.destroyed && request.revision === this.revision) {
        if (!this.current(request)) {this.settings.set(null); this.error.set(''); this.message.set('');}
        this.loading.set(false); this.saving.set(false);
      }
    }
  }
}
