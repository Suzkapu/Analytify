import {ChangeDetectionStrategy, Component, computed, ElementRef, input, OnDestroy, signal, ViewChild} from '@angular/core';

export interface RankHistoryPosition {timestamp: number; rank: number;}
export type RankHistoryCategory = 'tracks' | 'artists' | 'genres';

/** Canonical Figma730:22805: plot geometry is calculated from real daily positions. */
@Component({
  selector: 'v2-rank-history-plot', standalone: true,
  template: `
    @if (positions().length >= 2) {
      <div #canvas class="history-plot" role="slider" tabindex="0" aria-label="Saved ranking position"
        aria-orientation="horizontal" aria-valuemin="1" [attr.aria-valuemax]="positions().length"
        aria-description="Use Left and Right arrows, Home or End to inspect saved dates and positions."
        [attr.aria-valuenow]="activeIndex() + 1" [attr.aria-valuetext]="activeDescription()"
        (focus)="inspectFirst()" (keydown)="inspectKey($event)" (click)="inspectPointer($event, true)"
        (pointermove)="inspectPointer($event, false)">
        <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" aria-hidden="true" focusable="false">
          @for (axis of axes(); track axis.rank) {
            <line class="grid-line" x1="32" [attr.x2]="width() - 24" [attr.y1]="axis.y" [attr.y2]="axis.y" />
            <text class="axis-label" x="8" [attr.y]="axis.y + 8">#{{ axis.rank }}</text>
          }
          <path class="history-area" [attr.d]="area()" />
          <path class="history-line" [attr.d]="line()" />
          @for (point of geometry(); track $index; let index = $index) {
            <circle class="position-marker" [attr.cx]="point.x" [attr.cy]="point.y" [attr.r]="selected() !== null && activeIndex() === index ? 5 : 3" />
            @if (labelIndices().has(index)) {
              <text class="position-label" text-anchor="middle" [attr.x]="point.x" [attr.y]="point.y - 12">#{{ point.rank }}</text>
              <text class="date-label" [attr.text-anchor]="index === 0 ? 'start' : index === positions().length - 1 ? 'end' : 'middle'"
                [attr.x]="index === 0 ? point.x - 12 : point.x" [attr.y]="height() - 12">{{ shortDate(point.timestamp) }}</text>
            }
          }
          @if (selected() !== null) {
            <circle class="inspection-ring" [attr.cx]="geometry()[activeIndex()].x" [attr.cy]="geometry()[activeIndex()].y" r="22" />
            <text class="inspection-label" x="32" y="20">{{ shortDate(positions()[activeIndex()].timestamp) }} · #{{ positions()[activeIndex()].rank }}</text>
          }
        </svg>
      </div>
      <p class="visually-hidden" aria-live="polite" aria-atomic="true">{{ selected() === null ? '' : activeDescription() }}</p>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .history-plot { height: 248px; border-radius: var(--v2-radius-card); background: var(--v2-color-background); cursor: crosshair; }
    .history-plot:focus-visible { outline: 2px solid var(--v2-color-focus) !important; outline-offset: -2px; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    text { font-family: inherit; font-size: 10px; font-weight: 400; }
    .grid-line { stroke: var(--v2-color-border); stroke-dasharray: 3 3; stroke-width: 1; }
    .axis-label, .date-label { fill: var(--v2-color-text-muted); }
    .history-area { fill: var(--v2-color-selection); }
    .history-line { stroke: var(--v2-color-accent); stroke-width: 2.5; fill: none; }
    .position-marker { fill: var(--v2-color-accent); }
    .position-label { fill: var(--v2-color-text); font-weight: 600; }
    .inspection-ring { fill: none; stroke: var(--v2-color-focus); stroke-width: 1.5; }
    .inspection-label { fill: var(--v2-color-accent); font-weight: 600; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
    @media (max-width: 600px) { .history-plot { height: 232px; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2RankHistoryPlotComponent implements OnDestroy {
  readonly points = input<readonly RankHistoryPosition[]>([]);
  readonly category = input<RankHistoryCategory>('tracks');
  readonly width = signal(512);
  readonly height = signal(248);
  readonly selected = signal<number | null>(null);
  private activeCanvas?: ElementRef<HTMLElement>;
  @ViewChild('canvas') set canvas(element: ElementRef<HTMLElement> | undefined) {
    this.resizeObserver?.disconnect();
    this.activeCanvas = element;
    if (!element || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(entries => {
      if (this.activeCanvas !== element) return;
      const {width, height} = entries[0].contentRect;
      if (width > 56 && height > 84) {this.width.set(width); this.height.set(height);}
    });
    this.resizeObserver.observe(element.nativeElement);
  }
  private resizeObserver?: ResizeObserver;
  readonly maxRank = computed(() => this.category() === 'tracks' ? 100 : this.category() === 'artists' ? 50 : 15);
  readonly positions = computed(() => this.points().filter(point => Number.isFinite(new Date(point.timestamp).getTime()) &&
    Number.isInteger(point.rank) && point.rank >= 1 && point.rank <= this.maxRank()));
  readonly activeIndex = computed(() => {
    if (this.selected() === null) return 0;
    const index = this.positions().findIndex(point => point.timestamp >= this.selected()!);
    return index === -1 ? Math.max(0, this.positions().length - 1) : index;
  });
  readonly axes = computed(() => [1, this.category() === 'tracks' ? 50 : this.category() === 'artists' ? 25 : 8, this.maxRank()]
    .map(rank => ({rank, y: this.rankY(rank)})));
  readonly geometry = computed(() => this.positions().map((point, index, positions) => ({...point,
    x: 32 + index / Math.max(1, positions.length - 1) * (this.width() - 56),
    y: this.rankY(point.rank)
  })));
  readonly line = computed(() => this.geometry().length < 2 ? '' : this.geometry().map((point, index) => `${index ? 'L' : 'M'} ${point.x},${point.y}`).join(' '));
  readonly area = computed(() => this.line() ? `${this.line()} L ${this.width() - 24},${this.height() - 44} L 32,${this.height() - 44} Z` : '');
  readonly labelIndices = computed(() => {
    const count = this.positions().length;
    const capacity = Math.min(count > 10 ? 6 : count, Math.max(2, Math.floor((this.width() - 56) / 60)));
    const indices = new Set<number>();
    for (let index = 0; index < Math.min(count, capacity); index++) {
      indices.add(Math.round(index * (count - 1) / Math.max(1, Math.min(count, capacity) - 1)));
    }
    return indices;
  });
  readonly activeDescription = computed(() => {
    const point = this.positions()[this.activeIndex()];
    return point ? `${this.shortDate(point.timestamp)} ${new Date(point.timestamp).getFullYear()}, position ${point.rank}` : '';
  });

  ngOnDestroy(): void { this.activeCanvas = undefined; this.resizeObserver?.disconnect(); }
  private rankY(rank: number): number {
    return 40 + (rank - 1) / (this.maxRank() - 1) * (this.height() - 84);
  }
  shortDate(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]}`;
  }
  inspectFirst(): void { if (this.positions().length >= 2 && this.selected() === null) this.selected.set(this.positions()[0].timestamp); }
  inspectKey(event: KeyboardEvent): void {
    if (this.positions().length < 2 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? this.positions().length - 1 :
      this.activeIndex() + (event.key === 'ArrowLeft' ? -1 : 1);
    this.selected.set(this.positions()[Math.max(0, Math.min(index, this.positions().length - 1))].timestamp);
  }
  inspectPointer(event: MouseEvent, focus: boolean): void {
    if (this.positions().length < 2) return;
    const canvas = event.currentTarget as HTMLElement;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width) return;
    const index = Math.round(((event.clientX - bounds.left) / bounds.width * this.width() - 32) /
      (this.width() - 56) * (this.positions().length - 1));
    this.selected.set(this.positions()[Math.max(0, Math.min(index, this.positions().length - 1))].timestamp);
    if (focus) canvas.focus();
  }
}
