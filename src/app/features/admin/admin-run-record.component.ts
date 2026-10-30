import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {AdminSyncRun} from '@core/admin/admin.models';

import {validAdminTimestamp} from './admin-timestamp';

/** Read-only canonical audit record1108:32913. Never infer live or missing times. */
@Component({
  selector: 'v2-admin-run-record', standalone: true, imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin-run-record.component.scss',
  template: `
    <article [attr.aria-label]="label() + ' for ' + run().displayName">
      <h3>{{ label() }}</h3>
      <p>{{ run().displayName }} · {{ run().triggerType === 'manual' ? 'Manual' : 'Scheduled' }}</p>
      <span class="status" [class.success]="run().status === 'succeeded'" [class.queued]="run().status === 'queued'">{{ statusText() }}</span>
      @if (requested(); as value) {<p>Requested <time [attr.datetime]="value">{{ value | date:'d MMM y, HH:mm':'UTC' }} UTC</time></p>}
      @if (started(); as value) {
        <p>Started <time [attr.datetime]="value">{{ value | date:'d MMM y, HH:mm:ss':'UTC' }} UTC</time></p>
      } @else {<p>Not started · No duration available</p>}
      @if (finished(); as value) {
        <p>Finished <time [attr.datetime]="value">{{ value | date:'d MMM y, HH:mm:ss':'UTC' }} UTC</time> ·
          @if (duration() !== null) {Duration {{ duration() }}s} @else {No duration available}
        </p>
      } @else if (run().status === 'running') {<p>In progress · No finished time yet</p>}
      @else if (started()) {<p>No finished time · No duration available</p>}
      @if (run().error) {<p>{{ run().error }}</p>}
      @for (warning of warnings(); track $index) {<p>{{ warning }}</p>}
    </article>
  `
})
export class AdminRunRecordComponent {
  readonly run = input.required<AdminSyncRun>();
  readonly label = input.required<string>();
  readonly requested = computed(() => validAdminTimestamp(this.run().requestedAt));
  readonly started = computed(() => validAdminTimestamp(this.run().startedAt));
  readonly finished = computed(() => validAdminTimestamp(this.run().finishedAt));
  readonly duration = computed(() => {
    const start = this.started(), finish = this.finished();
    if (!start || !finish) return null;
    const elapsed = Date.parse(finish) - Date.parse(start);
    return elapsed >= 0 ? elapsed / 1000 : null;
  });
  readonly warnings = computed(() => {
    const warnings = this.run().details?.['warnings'];
    return Array.isArray(warnings) ? warnings.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
  });
  readonly statusText = computed(() => this.run().status === 'succeeded' && this.warnings().length > 0
    ? 'Succeeded · Warning'
    : ({queued: 'Queued', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled'})[this.run().status]);
}
