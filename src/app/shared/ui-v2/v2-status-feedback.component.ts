import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/** Shared canonical polite feedback foundation used by administration workflows. */
@Component({
  selector: 'v2-status-feedback', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; }
    section { display: flex; flex-direction: column; gap: var(--v2-space-2, 8px); padding: var(--v2-space-4, 16px); border: 1px solid var(--v2-color-info, #77b8ff); border-radius: var(--v2-radius-control, 12px); background: var(--v2-color-surface-raised, #182019); font-family: var(--v2-font-family, 'Outfit', sans-serif); font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
    h3, p { margin: 0; font: inherit; }
    h3 { font-weight: 600; color: var(--v2-color-info, #77b8ff); }
    p { color: var(--v2-color-text-muted, #a2ada6); }
  `],
  template: `<section role="status" aria-live="polite" [attr.aria-busy]="busy() ? 'true' : null"><h3>{{ heading() }}</h3><p>{{ message() }}</p></section>`
})
export class V2StatusFeedbackComponent {
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly busy = input(false);
}
