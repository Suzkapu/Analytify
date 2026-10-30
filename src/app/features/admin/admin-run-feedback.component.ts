import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {V2StatusFeedbackComponent} from '@shared/ui-v2/v2-status-feedback.component';

export type AdminRunFeedbackState = 'loading' | 'refreshing' | 'empty' | 'load-error' | 'refresh-error';
const COPY: Record<AdminRunFeedbackState, readonly [string, string]> = {
  loading: ['Loading recent runs…', 'Synchronization audit records will appear here.'],
  refreshing: ['Refreshing recent runs…', 'Current audit records stay visible while we check for updates.'],
  empty: ['No jobs have been queued yet.', 'Scheduled and manually requested runs will appear here.'],
  'load-error': ['Recent runs could not be loaded', 'Use Refresh recent runs to try again. No audit action is available on individual records.'],
  'refresh-error': ['Recent runs could not be refreshed', 'Current audit records are kept. Use Refresh recent runs to try again.']
};

/** Canonical1110:32965; the independent Refresh recent runs control owns recovery. */
@Component({
  selector: 'v2-admin-run-feedback', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [V2StatusFeedbackComponent],
  styles: [':host { display: block; min-width: 0; }'],
  template: `<v2-status-feedback [heading]="copy()[0]" [message]="copy()[1]" [busy]="busy()" />`
})
export class AdminRunFeedbackComponent {
  readonly state = input.required<AdminRunFeedbackState>();
  readonly busy = computed(() => this.state() === 'loading' || this.state() === 'refreshing');
  readonly copy = computed(() => COPY[this.state()]);
}
