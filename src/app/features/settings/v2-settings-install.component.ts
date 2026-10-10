import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {V2PageComponent} from '@shared/ui-v2/design-v2-primitives';

/** Canonical installation guide 44:1848 / 50:1945; cards explain possible states. */
@Component({
  selector: 'v2-settings-install', standalone: true, imports: [V2PageComponent],
  template: `
    <v2-page title="Install Analytify" appearance="canonical" [showBack]="true" (backRequested)="navigation.navigate('settingsNotifications')">
      <section class="v2-install" aria-label="Installation and notification guidance">
        <h2>Install Analytify</h2>
        <p>Open your browser menu and choose Install app. On iPhone, use Share → Add to Home Screen. Installation options depend on your browser.</p>
        @for (state of states; track state.title) {
          <article><h2>{{ state.title }}</h2><p>{{ state.description }}</p><span [class]="'v2-install__badge v2-install__badge--' + state.tone">{{ state.label }}</span></article>
        }
      </section>
    </v2-page>
  `,
  styleUrl: './v2-settings-install.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsInstallComponent {
  readonly navigation = inject(DesignNavigationService);
  readonly states = [
    {title: 'Notifications enabled on this device', description: 'You can receive updates here.', label: 'Connected', tone: 'success'},
    {title: 'Notification permission required', description: 'Choose Enable notifications in Settings, then allow notifications when your browser asks.', label: 'Pending', tone: 'warning'},
    {title: 'Notifications are blocked', description: 'Allow notifications in your browser settings, then return here.', label: 'Disabled', tone: 'neutral'},
    {title: 'Notifications are unavailable', description: 'Use a supported browser or install Analytify on this device.', label: 'Unavailable', tone: 'neutral'},
    {title: 'Finish setting up this device', description: 'Your preferences are saved. Enable notifications here to receive them on this device.', label: 'Pending', tone: 'warning'}
  ] as const;
}
