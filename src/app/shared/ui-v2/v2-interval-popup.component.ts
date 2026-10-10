import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {SyncIntervalUnit} from '@core/sync/sync-schedule-policy';
import {V2ButtonDirective} from './design-v2-primitives';

/** Canonical free-entry Every / Unit popups 988:32264 and 988:32281. */
@Component({
  selector: 'v2-interval-popup', standalone: true, imports: [FormsModule, AccessibleDialogDirective, V2ButtonDirective],
  template: `
    <div class="v2-interval-layer">
      <div class="v2-interval-backdrop" aria-hidden="true" (click)="cancelled.emit()"></div>
      <section class="v2-interval-popup" role="dialog" aria-modal="true" aria-labelledby="interval-popup-title"
        aria-describedby="interval-popup-description" appAccessibleDialog (modalEscape)="cancelled.emit()">
        <h2 id="interval-popup-title">{{ mode === 'value' ? 'Every' : 'Unit' }}</h2>
        <p id="interval-popup-description">{{ mode === 'value' ? 'Enter a whole number. The current unit and minimum interval apply.' : 'Choose the unit for your interval. This changes only your unsaved draft.' }}</p>
        @if (mode === 'value') {
          <input type="number" aria-label="Every" appModalInitialFocus [min]="minimum" [max]="maximum" step="1"
            [ngModel]="pending()" (ngModelChange)="pending.set($event); error.set('')"
            [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'interval-popup-error' : 'interval-popup-description'"
            (keydown.enter)="apply()">
          @if (error()) {<p id="interval-popup-error" role="alert">{{ error() }}</p>}
          <button type="button" v2Button="primary" (click)="apply()">Apply</button>
        } @else {
          @for (unit of units; track unit) {<button type="button" v2Button="secondary" (click)="unitChosen.emit(unit)">{{ unit }}</button>}
        }
        <button type="button" v2Button="secondary" (click)="cancelled.emit()">Cancel</button>
      </section>
    </div>`,
  styleUrl: './v2-interval-popup.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2IntervalPopupComponent implements OnChanges {
  @Input({required: true}) mode: 'value' | 'unit' = 'value';
  @Input({required: true}) value = 1;
  @Input({required: true}) minimum = 1;
  @Input({required: true}) maximum = 10080;
  @Input({required: true}) unit: SyncIntervalUnit = 'minutes';
  @Output() readonly valueChosen = new EventEmitter<number>();
  @Output() readonly unitChosen = new EventEmitter<SyncIntervalUnit>();
  @Output() readonly cancelled = new EventEmitter<void>();
  readonly pending = signal<number | null>(1);
  readonly error = signal('');
  readonly units: readonly SyncIntervalUnit[] = ['minutes', 'hours', 'days'];
  ngOnChanges(): void {this.pending.set(this.value); this.error.set('');}
  apply(): void {
    const value = this.pending();
    if (value === null || !Number.isInteger(value)) {this.error.set('Choose a whole-number interval.'); return;}
    if (value < this.minimum) {this.error.set(`Choose at least ${this.minimum} ${this.unit}.`); return;}
    if (value > this.maximum) {this.error.set('Choose an interval no longer than 7 days.'); return;}
    this.valueChosen.emit(value);
  }
}
