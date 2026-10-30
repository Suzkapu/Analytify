import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';

/** Canonical preference row (35:1097) and static Switch states (29:957). */
@Component({
  selector: 'v2-preference-row', standalone: true,
  template: `
    <label class="v2-preference-row" [class.is-compact]="compact">
      @if (!compact) {<img [src]="iconUrl" width="20" height="20" alt="">}
      <span class="v2-preference-row__copy"><strong>{{ label }}</strong>@if (description) {<small>{{ description }}</small>}</span>
      <span class="v2-preference-row__switch" [class.is-disabled]="disabled">
        <input type="checkbox" role="switch" [attr.aria-label]="ariaLabel || label" [checked]="checked" [disabled]="disabled"
          (change)="requestChange($event)">
        <img [src]="checked ? 'assets/design-v2/switch-on.svg' : 'assets/design-v2/switch-off.svg'" width="48" height="24" alt="">
      </span>
    </label>
  `,
  styleUrl: './v2-preference-row.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2PreferenceRowComponent {
  @Input({required: true}) label = '';
  @Input({required: true}) description = '';
  @Input({required: true}) iconUrl = '';
  @Input() compact = false;
  @Input() ariaLabel = '';
  @Input() checked = false;
  @Input() disabled = false;
  @Output() readonly checkedChange = new EventEmitter<boolean>();

  requestChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const requested = input.checked;
    // Native checkboxes change before Angular renders. Keep the saved value
    // visible until the parent confirms the asynchronous service result.
    input.checked = this.checked;
    if (!this.disabled) this.checkedChange.emit(requested);
  }
}
