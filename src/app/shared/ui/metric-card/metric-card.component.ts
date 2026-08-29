import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
  selector: 'app-metric-card',
  templateUrl: './metric-card.component.html',
  styleUrls: ['./metric-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MetricCardComponent {
  @Input() icon = 'pi-chart-bar';
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() loading = false;
}
