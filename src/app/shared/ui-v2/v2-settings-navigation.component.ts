import {NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {RouterLink, RouterLinkActive} from '@angular/router';

export interface V2SettingsDestination {
  id: string;
  label: string;
  mobileLabel?: string;
  commands: readonly string[];
  iconUrl?: string;
  iconClass?: string;
  mobileOnly?: boolean;
}

@Component({
  selector: 'v2-settings-navigation', standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="v2-settings-navigation" aria-label="Settings sections">
      @for (destination of destinations; track destination.id) {
        <a [routerLink]="destination.commands" routerLinkActive="is-active" ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored'}"
          [attr.aria-label]="destination.label"
          [class.v2-settings-navigation__mobile-only]="destination.mobileOnly">
          @if (destination.iconUrl) { <img [src]="destination.iconUrl" width="18" height="18" alt=""> }
          @else { <i [class]="'pi ' + destination.iconClass" aria-hidden="true"></i> }
          <span class="v2-settings-navigation__desktop-label">{{ destination.label }}</span>
          <span class="v2-settings-navigation__mobile-label">{{ destination.mobileLabel || destination.label }}</span>
        </a>
      }
    </nav>
  `,
  styleUrl: './v2-settings-navigation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsNavigationComponent {
  @Input({required: true}) destinations: readonly V2SettingsDestination[] = [];
}

@Component({
  selector: 'v2-destination-row', standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    @if (externalHref) {
      <a class="v2-destination-row" [href]="externalHref" target="_blank" rel="noopener noreferrer">
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <a class="v2-destination-row" [routerLink]="commands"><ng-container [ngTemplateOutlet]="content" /></a>
    }
    <ng-template #content>
      @if (iconUrl) { <img [src]="iconUrl" width="20" height="20" alt=""> }
      @else { <i [class]="'pi ' + iconClass" aria-hidden="true"></i> }
      <span>{{ label }}</span>
      <i class="pi pi-chevron-right" aria-hidden="true"></i>
    </ng-template>
  `,
  styleUrl: './v2-settings-navigation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2DestinationRowComponent {
  @Input({required: true}) label = '';
  @Input() iconUrl = '';
  @Input() iconClass = '';
  @Input() commands: readonly string[] = [];
  @Input() externalHref = '';
}
