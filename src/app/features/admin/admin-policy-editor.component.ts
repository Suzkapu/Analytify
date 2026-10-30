import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SyncSchedulePolicy} from '@core/admin/admin.models';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';

/** Canonical policy editor1100:32712; application service owns validation and writes. */
@Component({
  selector: 'v2-admin-policy-editor',
  standalone: true,
  imports: [FormsModule, V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin-policy-editor.component.scss',
  template: `
    <section class="policy-editor" [attr.aria-label]="label + ' schedule limit'" [attr.aria-busy]="busy">
      <h3>{{ label }}</h3>
      @if (policy.taskKey === 'listening_history') {
        <label class="availability"><span>Available to users</span>
          <input type="checkbox" role="switch" [(ngModel)]="policy.available" [disabled]="busy">
          <span class="switch-track" aria-hidden="true"></span>
        </label>
      }
      <div class="controls">
        <div class="control-field"><label [for]="'policy-interval-' + policy.taskKey">Minimum interval</label><input type="number" [(ngModel)]="policy.intervalValue"
          [id]="'policy-interval-' + policy.taskKey" min="1" [max]="maximum" step="1" [disabled]="busy"></div>
        <div class="control-field unit-field"><label [for]="'policy-unit-' + policy.taskKey">Unit</label><select [(ngModel)]="policy.intervalUnit" [disabled]="busy" [id]="'policy-unit-' + policy.taskKey">
          <option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option>
        </select></div>
        <button type="button" v2Button="secondary" [disabled]="busy" [loading]="busy" (click)="submit()">
          <span class="action-icon" [class.refresh-icon]="refreshRequired" aria-hidden="true"></span>
          {{ busy ? 'Saving…' : refreshRequired ? 'Refresh policy' : 'Save' }}
        </button>
      </div>
      <p role="status" aria-live="polite">{{ message || 'Users may choose this interval or a slower one. Changes apply after Save.' }}</p>
    </section>
  `
})
export class AdminPolicyEditorComponent {
  @Input({required: true}) policy!: SyncSchedulePolicy;
  @Input({required: true}) label = '';
  @Input() busy = false;
  @Input() message = '';
  @Input() refreshRequired = false;
  @Output() readonly save = new EventEmitter<SyncSchedulePolicy>();
  @Output() readonly refresh = new EventEmitter<SyncSchedulePolicy>();

  get maximum(): number { return this.policy.intervalUnit === 'days' ? 7 : this.policy.intervalUnit === 'hours' ? 168 : 10080; }

  submit(): void {
    if (this.busy) return;
    if (this.refreshRequired) this.refresh.emit(this.policy);
    else this.save.emit(this.policy);
  }
}
