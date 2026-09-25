import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {DESIGN_VARIANT, DesignVariant} from '@core/navigation/design-navigation';

@Component({
  selector: 'app-design-v2-shell',
  templateUrl: './design-v2-shell.component.html',
  styleUrls: ['./design-v2-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class DesignV2ShellComponent {
  constructor(@Inject(DESIGN_VARIANT) readonly designVariant: DesignVariant) {}
}
