import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {V2ButtonDirective} from './design-v2-primitives';

export type CurrentStatsFeedbackState = 'loading' | 'empty' | 'unavailable' | 'refreshing' | 'refresh-failed';

/** Canonical current-range feedback969:29865; shared retrieval never exposes private actions. */
@Component({
  selector: 'v2-current-stats-feedback', standalone: true, imports: [V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="feedback" [class.unavailable]="failed()"
      [attr.role]="failed() ? 'alert' : 'status'" [attr.aria-live]="failed() ? 'assertive' : 'polite'"
      [attr.aria-busy]="state() === 'loading' || state() === 'refreshing' ? 'true' : null">
      @if (state() === 'loading') {
        <div class="loading-panel">
          <div class="loading-label"><span class="progress-slot"><img class="progress" src="assets/design-v2/stats-current-progress.svg" width="20" alt=""></span><h3 class="title">{{ title() }}</h3></div>
          <p>{{ description() }}</p>
          <div class="skeletons" aria-hidden="true">
            @for (row of skeletonRows; track row) { <div class="skeleton-row"><span class="skeleton artwork"></span><span class="skeleton-copy"><span class="skeleton name"></span><span class="skeleton detail"></span></span></div> }
          </div>
        </div>
      } @else if (state() === 'refreshing') {
        <p class="loading-label"><span class="progress-slot"><img class="progress" src="assets/design-v2/stats-current-progress.svg" width="20" alt=""></span><span>Refreshing this range… Your cached rankings stay visible.</span></p>
      } @else {
        <h3 class="title">{{ title() }}</h3><p>{{ description() }}</p>
        @if (failed()) { <div class="actions"><button type="button" v2Button="secondary" (click)="requestRetry()">Retry</button></div> }
      }
    </section>
  `,
  styleUrl: './v2-snapshot-feedback.component.scss',
  styles: ['h3 { margin: 0; font: inherit; font-weight: 600; overflow-wrap: anywhere; } .loading-label > h3 { flex: 1; min-width: 0; } .loading-label > .progress-slot { display: block; position: relative; flex: none; width: 20px; height: 20px; } .progress { position: absolute; top: .2247px; left: 0; animation: none; }']
})
export class V2CurrentStatsFeedbackComponent {
  readonly state = input<CurrentStatsFeedbackState>('loading');
  readonly shared = input(false);
  readonly category = input<'tracks' | 'artists' | 'genres'>('tracks');
  readonly message = input('');
  readonly retry = output<void>();
  readonly skeletonRows = [0, 1, 2];
  readonly failed = computed(() => this.state() === 'unavailable' || this.state() === 'refresh-failed');
  readonly title = computed(() => {
    if (this.state() === 'loading') return this.shared() ? 'Loading shared Spotify insights…' : 'Loading your Spotify insights…';
    if (this.state() === 'unavailable') return this.shared() ? 'Shared stats unavailable' : 'Spotify insights unavailable';
    if (this.state() === 'refresh-failed') return 'Could not refresh this range';
    return this.category() === 'tracks' ? 'No top songs found' : this.category() === 'artists' ? 'No top artists found' : 'No genre data found';
  });
  readonly description = computed(() => {
    if (this.message()) return this.message();
    if (this.state() === 'loading') return this.shared() ? 'This read-only snapshot will appear when the range is ready.' : 'Your rankings will appear when this range is ready.';
    if (this.state() === 'unavailable') return this.shared() ? 'This range is unavailable. Retry or choose another ranking period.' : 'We couldn’t load this range. Retry to request it again.';
    if (this.state() === 'refresh-failed') return 'Your cached rankings are still visible. Retry to update them.';
    return 'Try another search, category or ranking period.';
  });
  requestRetry(): void { if (this.failed()) this.retry.emit(); }
}
