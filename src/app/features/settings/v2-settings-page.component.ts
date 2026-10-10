import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {V2PageComponent} from '@shared/ui-v2/design-v2-primitives';
import {V2SettingsDestination, V2SettingsNavigationComponent} from '@shared/ui-v2/v2-settings-navigation.component';

@Component({
  selector: 'v2-settings-page', standalone: true,
  imports: [V2PageComponent, V2SettingsNavigationComponent, RouterOutlet],
  template: `
    <v2-page title="Settings" description="Manage your account, notifications, updates and saved data."
      appearance="canonical" [showDescriptionOnMobile]="false">
      <v2-settings-navigation v2PageTabs [destinations]="destinations" />
      <router-outlet />
    </v2-page>
  `,
  styles: ':host {display: block; min-width: 0;} router-outlet {display: none;}',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsPageComponent {
  private readonly navigation = inject(DesignNavigationService);
  readonly destinations: readonly V2SettingsDestination[] = [
    {id: 'account', label: 'Account', iconClass: 'pi-user', commands: this.navigation.commands('settingsAccount')},
    {id: 'notifications', label: 'Notifications', mobileLabel: 'Alerts', iconClass: 'pi-bell', commands: this.navigation.commands('settingsNotifications')},
    {id: 'updates', label: 'Updates', iconClass: 'pi-sync', commands: this.navigation.commands('settingsUpdates')},
    {id: 'data', label: 'Data', iconClass: 'pi-database', commands: this.navigation.commands('settingsData')},
    {id: 'navigation', label: 'Navigation', iconClass: 'pi-cog', commands: this.navigation.commands('settingsNavigation'), mobileOnly: true}
  ];
}
