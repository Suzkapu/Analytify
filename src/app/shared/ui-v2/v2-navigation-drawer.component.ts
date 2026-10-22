import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {V2NavigationPanelComponent} from './v2-navigation-panel.component';

/** Canonical mobile menu105:3505; never inherits desktop collapse state. */
@Component({
  selector: 'v2-navigation-drawer', standalone: true,
  imports: [AccessibleDialogDirective, V2NavigationPanelComponent],
  template: `<button type="button" class="drawer-backdrop" aria-label="Close navigation menu" (click)="dismissed.emit()"></button>
    <section class="navigation-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu"
      appAccessibleDialog (modalEscape)="dismissed.emit()">
      <v2-navigation-panel [currentUrl]="currentUrl()" [displayName]="displayName()" [profilePicUrl]="profilePicUrl()" [isAdmin]="isAdmin()"
        (brandActivated)="dismissed.emit()" (destinationSelected)="dismissed.emit()" (profileImageFailed)="profileImageFailed.emit()" />
    </section>`,
  styleUrl: './v2-navigation-drawer.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2NavigationDrawerComponent {
  readonly currentUrl = input.required<string>();
  readonly displayName = input.required<string>();
  readonly profilePicUrl = input<string | null>(null);
  readonly isAdmin = input(false);
  readonly dismissed = output<void>();
  readonly profileImageFailed = output<void>();
}
