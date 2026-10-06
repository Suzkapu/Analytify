import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {V2ButtonDirective} from './design-v2-primitives';
import {V2RankingFlameComponent} from './v2-ranking-flame.component';

/** Canonical row161:8697; ranking, permissions and navigation belong to its caller. */
@Component({
  selector: 'v2-stats-ranking-row',
  standalone: true,
  imports: [V2ButtonDirective, V2RankingFlameComponent],
  template: `
    <div class="rank" role="group" [attr.aria-label]="'Rank ' + rank + (movement ? '. ' + movementText : '')">
      @if (flameKind) { <v2-ranking-flame [kind]="flameKind" /> }
      <span class="rank-number" aria-hidden="true">{{ rank }}</span>
      @if (movement) { <span class="rank-movement" aria-hidden="true">{{ movementSymbol }}</span> }
    </div>
    <button type="button" class="artwork" [class.v2-ranking-art]="kind === 'tracks'"
      [class.v2-artist-art]="kind === 'artists'" [disabled]="!spotifyAvailable"
      [attr.aria-label]="'Open ' + name + ' on Spotify'" (click)="spotifyRequested.emit()">
      <img [src]="imageUrl" width="48" height="48" [alt]="name + (kind === 'tracks' ? ' cover' : ' photo')" loading="lazy">
    </button>
    <div class="copy" [class.v2-ranking-copy]="kind === 'tracks'" [class.v2-artist-copy]="kind === 'artists'">
      <strong>{{ name }}</strong>
      @if (supporting) { <span>{{ supporting }}</span> }
    </div>
    @if (historyAvailable) {
      <button type="button" class="history" v2Button="secondary"
        [class.v2-ranking-history]="kind === 'tracks'" [class.v2-artist-history]="kind === 'artists'"
        [attr.aria-label]="'View position history for ' + name" (click)="historyRequested.emit()">History</button>
    }
  `,
  styleUrl: './v2-stats-ranking-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2StatsRankingRowComponent {
  @Input() kind: 'tracks' | 'artists' = 'tracks';
  @Input({required: true}) name = '';
  @Input({required: true}) rank = 1;
  @Input({required: true}) imageUrl = '';
  @Input() supporting = '';
  @Input() movement = '';
  @Input() flameKind: 'hot' | 'debut' | null = null;
  @Input() spotifyAvailable = false;
  @Input() historyAvailable = true;
  @Output() readonly spotifyRequested = new EventEmitter<void>();
  @Output() readonly historyRequested = new EventEmitter<void>();

  get movementSymbol(): string {
    if (this.movement === 'NEW') return '✦';
    return this.movement.replace(/^([↑↓])(\d+)$/, '$1 $2');
  }

  get movementText(): string {
    if (this.movement === 'NEW') return 'New';
    if (this.movement === '—') return 'Unchanged';
    const change = /^([↑↓])(\d+)$/.exec(this.movement);
    if (!change) return this.movement;
    return `${change[1]} ${change[2]} ${Number(change[2]) === 1 ? 'place' : 'places'}`;
  }
}
