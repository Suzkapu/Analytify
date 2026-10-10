import {ChangeDetectionStrategy, Component, HostListener, OnInit, inject} from '@angular/core';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';
import {V2PreferenceRowComponent} from '@shared/ui-v2/v2-preference-row.component';
import {V2DestinationRowComponent} from '@shared/ui-v2/v2-settings-navigation.component';
import {V2NotificationSettingsController} from './v2-notification-settings.controller';

@Component({
  selector: 'v2-settings-notifications', standalone: true,
  imports: [V2ButtonDirective, V2PreferenceRowComponent, V2DestinationRowComponent],
  providers: [V2NotificationSettingsController],
  template: `
    <section class="v2-notifications" aria-label="Notification settings">
      <div class="v2-notifications__status" [attr.aria-busy]="state.loading() || state.saving()" aria-live="polite">
        @if (state.error()) {
          <strong>Notification settings could not be updated</strong><p role="alert">{{ state.error() }}</p>
          <button type="button" v2Button="primary" (click)="state.reload()"><i class="pi pi-bell" aria-hidden="true"></i>Retry</button>
        } @else if (state.savingDevice()) {
          <strong>Setting up notifications</strong><p>Allow notifications when your browser asks. Your category preferences stay unchanged.</p>
          <button type="button" v2Button="primary" [loading]="true"><i class="pi pi-bell" aria-hidden="true"></i>Setting up…</button>
        } @else if (state.loading()) {
          @if (state.settings()) {
            <strong>Refreshing notification settings</strong><p>Your saved preferences remain available while this device is checked.</p>
          } @else {
            <strong>Loading notification settings</strong><p>Checking saved preferences and this device.</p>
          }
        } @else if (state.settings(); as settings) {
          @switch (settings.deviceState) {
            @case ('registered') { <strong>Notifications enabled on this device</strong><p>You can receive updates here.</p> }
            @case ('denied') { <strong>Notifications are blocked</strong><p>Allow notifications in your browser settings, then return here.</p> }
            @case ('unsupported') { <strong>Notifications are unavailable</strong><p>Use a supported browser or install Analytify on this device.</p> }
            @default {
              <strong>Notifications aren't enabled on this device</strong><p>Your category preferences are saved, but this device will not receive alerts until notifications are enabled.</p>
              <button type="button" v2Button="primary" [disabled]="state.saving()" (click)="state.enableDevice()"><i class="pi pi-bell" aria-hidden="true"></i>Enable notifications</button>
            }
          }
        }
      </div>
      <v2-destination-row label="How to install app" iconUrl="assets/design-v2/settings-download.svg" [commands]="navigation.commands('settingsInstall')" />
      @if (state.settings(); as settings) {
        <v2-preference-row label="Song League pick window" description="Remind me when weekly picks open."
          iconUrl="assets/design-v2/settings-trophy.svg" [checked]="settings.songLeagueEnabled" [disabled]="state.saving() || state.loading()"
          (checkedChange)="state.setCategory('song_league', $event)" />
        @if (settings.songLeagueMember) {
          <v2-preference-row label="New Song League pick" description="Notify me when someone submits a song."
            iconUrl="assets/design-v2/settings-trophy.svg" [checked]="settings.songLeagueSongAddedEnabled" [disabled]="state.saving() || state.loading()"
            (checkedChange)="state.setCategory('song_league_song_added', $event)" />
        }
        <v2-preference-row label="Stats access requests" description="Notify me when someone asks to view my stats."
          iconUrl="assets/design-v2/settings-stats.svg" [checked]="settings.statsAccessRequestsEnabled" [disabled]="state.saving() || state.loading()"
          (checkedChange)="state.setCategory('stats_access_requests', $event)" />
        <p class="v2-notifications__note">Category preferences save automatically. Device permission is separate.</p>
      }
      <span class="v2-visually-hidden" role="status">{{ state.message() }}</span>
    </section>
  `,
  styleUrl: './v2-settings-notifications.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsNotificationsComponent implements OnInit {
  readonly state = inject(V2NotificationSettingsController);
  readonly navigation = inject(DesignNavigationService);
  ngOnInit(): void { void this.state.reload(); }
  @HostListener('window:focus') refresh(): void { void this.state.reload(); }
}
