import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';

/** Canonical compact family144:8020; consumers own eligibility, reason text and search effects. */
@Component({
  selector: 'v2-search-past-toggle',
  standalone: true,
  template: `<button type="button" role="switch" [attr.aria-checked]="checked" [disabled]="disabled"
    [attr.aria-describedby]="disabled ? disabledReasonId : null" (click)="requestToggle()">
    <span class="label">{{ label }}</span><span class="track" aria-hidden="true"><span class="thumb"></span></span>
  </button>`,
  styles: `
    :host { display: block; min-width: 0; width: 240px; }
    button { appearance: none; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
      gap: var(--v2-space-2); width: 100%; min-height: 48px; padding: 11px; border: 1px solid var(--v2-color-border);
      border-radius: var(--v2-radius-control); color: var(--v2-color-text); background: var(--v2-color-surface-raised);
      font-family: var(--v2-font-family); font-size: 14px; font-weight: 600; line-height: 20px; cursor: pointer; }
    .label { min-width: 0; overflow-wrap: anywhere; }
    .track { position: relative; flex: none; width: 32px; height: 18px; border-radius: 999px;
      background: var(--v2-color-border); transition: background-color 220ms ease-in-out; }
    .thumb { position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%;
      background: var(--v2-color-text); transition: transform 220ms ease-in-out, background-color 220ms ease-in-out; }
    [aria-checked="true"] .track { background: var(--v2-color-accent); }
    [aria-checked="true"] .thumb { transform: translateX(14px); background: var(--v2-color-accent-ink); }
    button:hover:not(:disabled) { border-color: var(--v2-color-accent); }
    button:focus-visible:not(:disabled) { border: 2px solid var(--v2-color-focus); padding: 10px; outline: none !important; }
    button:disabled { opacity: .45; cursor: default; }
    @media (prefers-reduced-motion: reduce) { .track, .thumb { transition: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SearchPastToggleComponent {
  @Input({required: true}) label!: string;
  @Input({required: true}) checked = false;
  @Input() disabled = false;
  @Input() disabledReasonId: string | null = null;
  @Output() checkedChange = new EventEmitter<boolean>();
  requestToggle(): void {
    if (!this.disabled) this.checkedChange.emit(!this.checked);
  }
}
