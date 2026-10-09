import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {V2ButtonDirective} from './design-v2-primitives';

export type SnapshotFeedbackState = 'loading' | 'empty' | 'unavailable';

/** Canonical selected snapshot feedback851:27182; responsive ranking/comparison outcomes. */
@Component({
  selector: 'v2-snapshot-feedback',
  standalone: true,
  imports: [V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="feedback" [class.unavailable]="state() === 'unavailable'"
      [attr.role]="state() === 'unavailable' ? 'alert' : 'status'"
      [attr.aria-live]="state() === 'unavailable' ? 'assertive' : 'polite'"
      [attr.aria-busy]="state() === 'loading' ? 'true' : null">
      @if (state() === 'loading') {
        @if (target() === 'ranking') {
          <div class="loading-panel">
            <p class="loading-label"><img class="progress" src="assets/design-v2/history-progress.svg" alt=""> <strong>Loading saved rankings…</strong></p>
            <p>Your selected date stays selected while its rankings load.</p>
            <div class="skeletons" aria-hidden="true">
              @for (row of skeletonRows; track row) {
                <div class="skeleton-row"><span class="skeleton artwork"></span><span class="skeleton-copy"><span class="skeleton name"></span><span class="skeleton detail"></span></span></div>
              }
            </div>
          </div>
        } @else {
          <p class="loading-label comparison"><img class="progress" src="assets/design-v2/history-progress.svg" alt=""> <span>Loading comparison rankings… Your selected rankings stay visible.</span></p>
        }
      } @else {
        <p class="title">{{ title() }}</p>
        <p>{{ message() }}</p>
        @if (privateActions()) {
          <div class="actions">
            @if (state() === 'unavailable') { <button type="button" v2Button="secondary" (click)="requestRetry()">Retry</button> }
            <button type="button" v2Button="secondary" (click)="requestChooseDate()">Choose date</button>
          </div>
        }
      }
    </section>
  `,
  styleUrl: './v2-snapshot-feedback.component.scss'
})
export class V2SnapshotFeedbackComponent {
  readonly state = input<SnapshotFeedbackState>('loading');
  readonly target = input<'ranking' | 'comparison'>('ranking');
  readonly privateActions = input(true);
  readonly retry = output<void>();
  readonly chooseDate = output<void>();
  readonly skeletonRows = [0, 1, 2];
  readonly title = computed(() => this.state() === 'unavailable'
    ? (this.target() === 'ranking' ? 'Saved rankings unavailable' : 'Comparison unavailable')
    : (this.target() === 'ranking' ? 'No rankings for this category' : 'No comparison rankings'));
  readonly message = computed(() => this.state() === 'unavailable'
    ? (this.target() === 'ranking' ? 'We couldn’t load this saved date. Retry or choose another date.' : 'We couldn’t load this comparison. Your selected rankings stay visible.')
    : (this.target() === 'ranking' ? 'Try another category, date or ranking period.' : 'Your selected rankings stay visible. Choose another date to compare.'));
  requestRetry(): void {
    if (this.privateActions() && this.state() === 'unavailable') this.retry.emit();
  }
  requestChooseDate(): void {
    if (this.privateActions() && this.state() !== 'loading') this.chooseDate.emit();
  }
}

