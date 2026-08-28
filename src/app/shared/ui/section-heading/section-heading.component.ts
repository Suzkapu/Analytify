import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
  selector: 'app-section-heading',
  templateUrl: './section-heading.component.html',
  styleUrls: ['./section-heading.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionHeadingComponent {
  @Input() icon = 'pi-chart-bar';
  @Input() eyebrow = '';
  @Input() title = '';
  @Input() description = '';
}
