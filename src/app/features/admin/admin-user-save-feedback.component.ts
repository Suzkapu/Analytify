import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {V2StatusFeedbackComponent} from '@shared/ui-v2/v2-status-feedback.component';
import {AdminUserSaveState} from './admin-user-save-state';

const COPY: Record<AdminUserSaveState, readonly [string, string]> = {
  validation: ['Check schedule intervals', 'Enter a whole number from 1 to 10080 for every interval. Your draft is kept; nothing was saved.'],
  saving: ['Saving settings…', 'This saves the values selected when you activated Save. Later edits are not submitted.'],
  refreshing: ['Refreshing user settings…', 'The save has already succeeded. Your later edits are kept while current settings are loaded.'],
  saved: ['Settings saved', 'Saved values were refreshed from the server.'],
  'newer-draft': ['Settings saved · Unsaved changes', 'Your later edits are kept. Save again to submit them.'],
  'save-error': ['Settings could not be saved', 'Your draft is kept. Check the error message and try Save again.'],
  'read-error': ['Settings saved · Refresh needed', 'The save succeeded, but current settings could not be loaded. Refresh user settings without saving again.']
};

/** Canonical1112:33021. Independent recovery action owns reads; feedback is read-only. */
@Component({
  selector: 'v2-admin-user-save-feedback', standalone: true, imports: [V2StatusFeedbackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: block; min-width: 0; }'],
  template: `<v2-status-feedback [heading]="copy()[0]" [message]="copy()[1]" [busy]="busy()" />`
})
export class AdminUserSaveFeedbackComponent {
  readonly state = input.required<AdminUserSaveState>();
  readonly copy = computed(() => COPY[this.state()]);
  readonly busy = computed(() => this.state() === 'saving' || this.state() === 'refreshing');
}
