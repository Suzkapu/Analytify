import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SyncIntervalUnit} from '@core/admin/admin.models';
import {V2PreferenceRowComponent} from '@shared/ui-v2/v2-preference-row.component';

/** Canonical task family1125:33476. Emits draft edits; the user card owns persistence. */
@Component({
  selector: 'v2-admin-user-task-editor', standalone: true,
  imports: [FormsModule, V2PreferenceRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin-user-task-editor.component.scss',
  template: `
    <section class="task-editor" [attr.aria-label]="label + ' optional schedule'" [attr.aria-busy]="busy">
      <div class="task-controls">
        <div class="task-choice">
          <v2-preference-row [compact]="true" [label]="label" description="" iconUrl=""
            [ariaLabel]="'Enable optional ' + label" [checked]="enabled" [disabled]="busy"
            (checkedChange)="enabledChange.emit($event)" />
          @if (requiredReason) {<p class="required-reason">{{ requiredReason }}</p>}
        </div>
        <div class="interval-controls">
          <div class="control-field">
            <label [for]="controlId + '-interval'">Optional interval</label>
            <input type="number" [id]="controlId + '-interval'" [attr.aria-label]="label + ' interval'"
              [ngModel]="intervalValue" (ngModelChange)="intervalValueChange.emit($event)"
              min="1" max="10080" step="1" [disabled]="busy">
          </div>
          <div class="control-field unit-field">
            <label [for]="controlId + '-unit'">Unit</label>
            <select [id]="controlId + '-unit'" [attr.aria-label]="label + ' interval unit'"
              [ngModel]="intervalUnit" (ngModelChange)="intervalUnitChange.emit($event)" [disabled]="busy">
              <option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option>
            </select>
            <img class="unit-chevron" src="assets/design-v2/admin-task-chevron.svg" width="20" height="20" alt="">
          </div>
        </div>
      </div>
      @if (fridaysOnly !== null) {
        <v2-preference-row [compact]="true" label="Only refresh on Fridays" description="" iconUrl=""
          ariaLabel="Refresh Song League playlists only on Fridays" [checked]="fridaysOnly" [disabled]="busy"
          (checkedChange)="fridaysOnlyChange.emit($event)" />
      }
    </section>
  `
})
export class AdminUserTaskEditorComponent {
  @Input({required: true}) label = '';
  @Input({required: true}) controlId = '';
  @Input() enabled = false;
  @Input() intervalValue: number | null = 60;
  @Input() intervalUnit: SyncIntervalUnit = 'minutes';
  @Input() requiredReason = '';
  @Input() fridaysOnly: boolean | null = null;
  @Input() busy = false;
  @Output() readonly enabledChange = new EventEmitter<boolean>();
  @Output() readonly intervalValueChange = new EventEmitter<number | null>();
  @Output() readonly intervalUnitChange = new EventEmitter<SyncIntervalUnit>();
  @Output() readonly fridaysOnlyChange = new EventEmitter<boolean>();
}
