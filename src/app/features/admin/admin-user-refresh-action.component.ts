import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';

/** Canonical1113:32975; parent owns the acknowledged-save/read-only recovery boundary. */
@Component({
  selector: 'v2-admin-user-refresh-action', standalone: true, imports: [V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin-user-refresh-action.component.scss',
  template: `<button type="button" v2Button="secondary" [disabled]="busy" [loading]="busy" (click)="refresh.emit()"><img class="refresh-icon" src="assets/design-v2/admin-user-refresh.svg" width="18" height="18" alt="" aria-hidden="true">Refresh user settings</button>`
})
export class AdminUserRefreshActionComponent {
  @Input() busy = false;
  @Output() readonly refresh = new EventEmitter<void>();
}
