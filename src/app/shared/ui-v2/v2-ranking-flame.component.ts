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
    /* Shared timeline from canonical blue/orange Flame nodes 716:22653/716:22650. */
    @property --v2-flame-rotation { syntax: '<angle>'; initial-value: 0rad; inherits: false; }
    svg {
      transform: rotate(var(--v2-flame-rotation, 0rad));
      transform-origin: 50% 50%;
      animation: flame-opacity 2s linear, flame-rotation 2s linear, flame-scale 2s linear;
      animation-iteration-count: infinite;
    }
    @keyframes flame-opacity {
      0% { animation-timing-function: ease-in-out; opacity: 1; }
      20% { animation-timing-function: ease-in-out; opacity: .84; }
      40% { animation-timing-function: ease-in-out; opacity: .96; }
      60% { animation-timing-function: ease-in-out; opacity: .88; }
      80%, 100% { opacity: 1; }
    }
    @keyframes flame-rotation {
      0% { animation-timing-function: ease-in-out; --v2-flame-rotation: 0rad; }
      20% { animation-timing-function: ease-in-out; --v2-flame-rotation: .035rad; }
      40% { animation-timing-function: ease-in-out; --v2-flame-rotation: -.026rad; }
      60% { animation-timing-function: ease-in-out; --v2-flame-rotation: .017rad; }
      80%, 100% { --v2-flame-rotation: 0rad; }
    }
    @keyframes flame-scale {
      0% { animation-timing-function: ease-in-out; scale: 1 1; }
      20% { animation-timing-function: ease-in-out; scale: 1 1.09; }
      40% { animation-timing-function: ease-in-out; scale: 1 .96; }
      60% { animation-timing-function: ease-in-out; scale: 1 1.04; }
      80%, 100% { scale: 1 1; }
    }
    @media (prefers-reduced-motion: reduce) { svg { animation: none; transform: none; scale: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2RankingFlameComponent {
  @Input() kind: 'hot' | 'debut' | null = null;
}
