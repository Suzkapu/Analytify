import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
  selector: 'app-page-state',
  templateUrl: './page-state.component.html',
  styleUrls: ['./page-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageStateComponent {
  @Input() icon = 'pi-info-circle';
  @Input() title = '';
  @Input() message = '';
  @Input() loading = false;
  @Input() compact = false;
  @Input() tone: 'neutral' | 'danger' = 'neutral';
}
