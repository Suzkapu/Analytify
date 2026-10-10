import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {DESIGN_V2_ACCOUNT_ACTIONS} from '@shared/layout/design-v2-shell/design-v2-account-actions';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';
import {V2DestinationRowComponent} from '@shared/ui-v2/v2-settings-navigation.component';

@Component({
  selector: 'v2-settings-account', standalone: true, imports: [V2DestinationRowComponent, V2ButtonDirective],
  template: `
    <section class="v2-settings-panel" aria-label="Account settings">
      <div class="v2-settings-profile">
        <span class="v2-settings-profile__avatar" aria-hidden="true">
          @if (actions.profilePicUrl()) {
            <img [src]="actions.profilePicUrl()" (error)="actions.profileImageFailed()" alt="">
          } @else { {{ actions.displayName().slice(0, 1).toUpperCase() }} }
        </span>
        <div><h2>{{ actions.displayName() }}</h2><p>Manage your Spotify connection and account.</p></div>
      </div>
      <v2-destination-row label="Spotify connection" iconClass="pi-link" externalHref="https://www.spotify.com/account/apps/" />
      <v2-destination-row label="Legal & privacy" iconClass="pi-shield" [commands]="navigation.commands('legal')" />
      <button type="button" v2Button="danger" class="v2-settings-danger" [loading]="actions.actionRunning()" (click)="actions.requestLogout()">
        <i class="pi pi-sign-out" aria-hidden="true"></i>Log out
      </button>
      @if (actions.actionError()) { <p role="alert">{{ actions.actionError() }}</p> }
    </section>
  `,
  styleUrl: './v2-settings-account-data.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsAccountComponent {
  readonly actions = inject(DESIGN_V2_ACCOUNT_ACTIONS);
  readonly navigation = inject(DesignNavigationService);
}

@Component({
  selector: 'v2-settings-data', standalone: true, imports: [V2ButtonDirective],
  template: `
    <section class="v2-settings-panel" aria-labelledby="v2-settings-data-title">
      <h2 id="v2-settings-data-title" class="v2-settings-section-title">Data &amp; privacy</h2>
      <p>Manage your saved data, cloud backup and privacy.</p>
      <label class="v2-settings-preference">
        <i class="pi pi-cloud" aria-hidden="true"></i>
        <span><strong>Cloud Backup</strong><small>Selected snapshots and encrypted scheduled access</small></span>
        <input type="checkbox" role="switch" aria-label="Cloud Backup" [checked]="actions.authService.isBackupActive()"
          [disabled]="actions.actionRunning()" (change)="actions.requestBackupChange($event)">
      </label>
      <button type="button" class="v2-settings-destination" [disabled]="actions.actionRunning()" (click)="actions.requestBackupEnable()">
        <i class="pi pi-cloud" aria-hidden="true"></i><span>Manage cloud backup</span><i class="pi pi-chevron-right" aria-hidden="true"></i>
      </button>
      <button type="button" v2Button="danger" class="v2-settings-danger" [loading]="actions.actionRunning()" (click)="actions.requestClearData()">
        <i class="pi pi-trash" aria-hidden="true"></i>Clear data
      </button>
      @if (actions.actionError()) { <p role="alert">{{ actions.actionError() }}</p> }
    </section>
  `,
  styleUrl: './v2-settings-account-data.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsDataComponent {
  readonly actions = inject(DESIGN_V2_ACCOUNT_ACTIONS);
}
