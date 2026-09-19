import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, OnInit, Output} from '@angular/core';
import {PushNotificationService, PushNotificationSettings} from '@core/notifications/push-notification.service';
import {SharedModule} from '../../shared.module';

@Component({
  selector: 'app-notification-settings-dialog',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './notification-settings-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationSettingsDialogComponent implements OnInit {
  @Output() readonly closed = new EventEmitter<void>();

  loading = true;
  saving = false;
  error = '';
  settings: PushNotificationSettings = {
    supported: false, installedPwa: false, permission: 'unavailable',
    deviceSubscribed: false, deviceRegistered: false, registeredDeviceCount: 0, deviceState: 'unsupported',
    songLeagueEnabled: false, songLeagueSongAddedEnabled: false, songLeagueMember: false,
    statsAccessRequestsEnabled: true, active: false, songAddedActive: false, statsAccessActive: false
  };

  constructor(
    private readonly notifications: PushNotificationService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.loading = false;
    this.changeDetector.markForCheck();
  }

  close(): void {
    if (!this.saving) this.closed.emit();
  }

  @HostListener('window:focus')
  async refreshOnFocus(): Promise<void> {
    if (this.saving) return;
    await this.reload(false);
  }

  toggleSongLeague(event: Event): Promise<void> {
    return this.update(() => this.notifications.setSongLeagueEnabled((event.target as HTMLInputElement).checked));
  }

  toggleSongAdded(event: Event): Promise<void> {
    return this.update(() => this.notifications.setSongLeagueSongAddedEnabled((event.target as HTMLInputElement).checked));
  }

  toggleStatsAccess(event: Event): Promise<void> {
    return this.update(() => this.notifications.setStatsAccessRequestsEnabled((event.target as HTMLInputElement).checked));
  }

  private async reload(reportError = true): Promise<void> {
    try {
      this.settings = await this.notifications.loadSettings();
      if (reportError) this.error = '';
    } catch (error) {
      if (reportError) this.error = (error as {message?: string})?.message || 'Notification settings could not be loaded.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private async update(action: () => Promise<PushNotificationSettings>): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.error = '';
    try {
      this.settings = await this.notifications.loadSettings();
      this.settings = await action();
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'The notification setting could not be changed.';
    } finally {
      this.saving = false;
      this.changeDetector.markForCheck();
    }
  }
}
