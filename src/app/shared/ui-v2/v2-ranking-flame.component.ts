import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

/** Canonical Figma component 716:22655; classification belongs to the Stats controller. */
@Component({
  selector: 'v2-ranking-flame',
  standalone: true,
  template: `
    @if (kind) {
      <svg viewBox="0 0 24 24" width="18" height="18" role="img"
        [attr.aria-label]="kind === 'debut' ? 'Top 10 debut' : 'Hot mover'"
        [class.debut]="kind === 'debut'">
        <title>{{ kind === 'debut' ? 'Top 10 debut' : 'Hot mover' }}</title>
        <path d="M12 2C13 7 19 8 19 14a7 7 0 0 1-14 0c0-3 2-5 4-7 0 3 1 4 2 5 2-3 2-6 1-10Z" />
      </svg>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; flex: 0 0 auto; }
    :host:empty { display: none; }
    svg { display: block; width: var(--v2-ranking-flame-size, 18px); height: var(--v2-ranking-flame-size, 18px); fill: var(--v2-color-hot-mover); }
    svg.debut { fill: var(--v2-color-info); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2RankingFlameComponent {
  @Input() kind: 'hot' | 'debut' | null = null;
}
