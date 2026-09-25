import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {DESIGN_VARIANT, DesignVariant} from '@core/navigation/design-navigation';

@Component({
  selector: 'app-design-v2-shell',
  templateUrl: './design-v2-shell.component.html',
  styleUrls: ['./design-v2-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet]
})
export class DesignV2ShellComponent {
  constructor(@Inject(DESIGN_VARIANT) readonly designVariant: DesignVariant) {}
}
