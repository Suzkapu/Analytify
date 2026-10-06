import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {V2ButtonDirective} from './design-v2-primitives';
import {GenreRanking, genreChartScale, genreComparisonCaption, genreShare} from './genre-chart.model';

@Component({
  selector: 'v2-genre-rankings',
  standalone: true,
  imports: [V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" [class.shared]="!historyAvailable()" role="group" aria-label="Genre shares">
      <div class="axis" aria-hidden="true">
        <span class="genre-heading">Genre</span>
        <span class="ticks">@for (tick of ticks(); track tick) { <span>{{ tick }}%</span> }</span>
        <span class="share-heading">Share</span>
        @if (historyAvailable()) { <span class="action-heading"></span> }
      </div>
      @for (row of rows(); track row.genre.name) {
        <div class="v2-genre-row">
          <div class="name"><strong>{{ row.genre.rank }}. {{ row.genre.name }}</strong>
            @if (row.caption) { <small>{{ row.caption }}</small> }
          </div>
          <span class="track" role="img" [attr.aria-label]="row.description">
            @if (row.previousWidth > row.currentWidth) { <i class="previous lost" [style.width.%]="row.previousWidth"></i> }
            <i class="current" [style.width.%]="row.currentWidth"></i>
            @if (row.previousWidth > 0 && row.previousWidth <= row.currentWidth) { <i class="previous marker" [style.width.%]="row.previousWidth"></i> }
          </span>
          <span class="share">{{ row.label }}</span>
          @if (historyAvailable()) {
            <button type="button" v2Button="secondary" class="history"
              [attr.aria-label]="'View position history for ' + row.genre.name"
              (click)="historyRequested.emit(row.genre)">
              <i class="pi pi-history" aria-hidden="true"></i>History
            </button>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './v2-genre-rankings.component.scss'
})
export class V2GenreRankingsComponent {
  readonly genres = input.required<readonly GenreRanking[]>();
  readonly scaleGenres = input<readonly GenreRanking[] | null>(null);
  readonly historyAvailable = input(true);
  readonly historyRequested = output<GenreRanking>();
  readonly scale = computed(() => genreChartScale(this.scaleGenres() ?? this.genres()));
  readonly ticks = computed(() => Array.from({length: 6}, (_, index) => index * this.scale() / 5));
  readonly rows = computed(() => this.genres().map(genre => {
    const share = genreShare(genre.percentage);
    const previous = genre.hasCompare && genre.trendType !== 'new' ? genreShare(genre.prevPercentage) : 0;
    const label = share < 1 ? '<1%' : `${share}%`;
    return {genre, label, caption: genreComparisonCaption(genre),
      currentWidth: share / this.scale() * 100, previousWidth: previous / this.scale() * 100,
      description: `${genre.name}: ${label}${genre.hasCompare && genre.trendType !== 'new' ? ', previously ' + previous + '%' : ''}`};
  }));
}
