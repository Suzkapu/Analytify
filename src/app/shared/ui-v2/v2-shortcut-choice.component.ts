import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';

/** Canonical selectable action tile used by Navigation688:41515. */
@Component({
  selector: 'v2-shortcut-choice', standalone: true,
  template: `<button type="button" class="shortcut-choice" [attr.aria-pressed]="selected()" [disabled]="disabled()"
    (click)="requestChange()"><i class="pi {{ icon() }}" aria-hidden="true"></i><span>{{ label() }}</span></button>`,
  styles: `:host {display:block; min-width:0;} button.shortcut-choice {display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; width:100%; min-height:48px; padding:4px 8px; border:1px solid var(--v2-color-border-control); border-radius:var(--v2-radius-control); background:var(--v2-color-surface); color:var(--v2-color-text); font:inherit; font-size:12px; font-weight:500; line-height:16px; cursor:pointer; transition:border-color .16s ease, background-color .16s ease;} .shortcut-choice i {font-size:18px; color:var(--v2-color-text-muted);} button.shortcut-choice[aria-pressed="true"] {border-color:var(--v2-color-accent); color:var(--v2-color-accent); background:var(--v2-color-selection);} button.shortcut-choice:hover:not(:disabled), button.shortcut-choice:focus-visible {border-color:var(--v2-color-accent);} button.shortcut-choice:focus-visible {outline:2px solid var(--v2-color-focus); outline-offset:3px;} button.shortcut-choice:disabled {opacity:.5; cursor:wait;} @media(prefers-reduced-motion:reduce) {button.shortcut-choice {transition:none;}}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ShortcutChoiceComponent {
  readonly label = input.required<string>();
  readonly icon = input.required<string>();
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly changeRequested = output<void>();
  requestChange(): void {if (!this.disabled()) this.changeRequested.emit();}
}
