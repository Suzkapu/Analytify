import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';

/** Canonical Stats date fields25:124/128 and25:812/816; chooser owns date navigation. */
@Component({
  selector: 'v2-snapshot-date-field', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="date-field" [attr.aria-label]="label()" [attr.aria-describedby]="valueId"
      aria-haspopup="dialog" [attr.aria-expanded]="expanded()" (click)="requestOpen($event)">
      <span class="label">{{ label() }}</span><span class="value" [id]="valueId">{{ value() }}</span>
    </button>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .date-field { display: flex; flex-direction: column; width: 100%; min-width: 0; gap: var(--v2-space-2); padding: 0; border: 0; background: transparent; text-align: left; font: inherit; cursor: pointer; }
    .label { color: var(--v2-color-text); font-size: 14px; font-weight: 600; line-height: 20px; overflow-wrap: anywhere; }
    .value { display: flex; align-items: center; width: 100%; min-height: 48px; box-sizing: border-box; padding: 11px var(--v2-space-4); border: 1px solid var(--v2-color-border-control); border-radius: var(--v2-radius-control); background: var(--v2-color-input); color: var(--v2-color-text-muted); font-size: 16px; font-weight: 400; line-height: 24px; overflow-wrap: anywhere; }
    .date-field:focus-visible { outline: none; }
    .date-field:focus-visible .value { outline: 2px solid var(--v2-color-focus); outline-offset: 2px; }
  `
})
export class V2SnapshotDateFieldComponent {
  private static nextId = 0;
  readonly valueId = `snapshot-date-value-${++V2SnapshotDateFieldComponent.nextId}`;
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly expanded = input(false);
  readonly open = output<Event>();
  requestOpen(event: Event): void { event.stopPropagation(); this.open.emit(event); }
}
