import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

/** Canonical automatic update status family 988:32207, also used for policy guidance. */
@Component({
  selector: 'v2-inline-status', standalone: true,
  template: `<section class="v2-inline-status" [attr.role]="error ? 'alert' : 'status'" [attr.aria-busy]="busy">
    <strong>{{ title }}</strong><p>{{ description }}</p><ng-content />
  </section>`,
  styles: `:host {display:block; min-width:0;} .v2-inline-status {display:flex; flex-direction:column; gap:var(--v2-space-2); padding:var(--v2-space-4); border:1px solid var(--v2-color-info); border-radius:var(--v2-radius-control); background:var(--v2-color-surface-raised); font-size:14px; line-height:20px; overflow-wrap:anywhere;} strong {color:var(--v2-color-info); font-weight:600;} p {margin:0; color:var(--v2-color-text-muted);}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2InlineStatusComponent {
  @Input({required: true}) title = '';
  @Input({required: true}) description = '';
  @Input() error = false;
  @Input() busy = false;
}
