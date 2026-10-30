import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {AdminUserTaskEditorComponent} from '../../src/app/features/admin/admin-user-task-editor.component';
import {SyncIntervalUnit} from '../../src/app/core/admin/admin.models';

@Component({standalone: true, imports: [AdminUserTaskEditorComponent],
  template: `<div class="design-v2"><v2-admin-user-task-editor controlId="native-task" [label]="label"
    [(enabled)]="enabled" [(intervalValue)]="value" [(intervalUnit)]="unit" [requiredReason]="reason"
    [(fridaysOnly)]="friday" /></div>`,
  styleUrl: '../../src/app/shared/layout/design-v2-shell/design-v2-shell.component.scss'})
class NativeTaskHost {
  label = 'Listening history'; enabled = true; value: number | null = 60;
  unit: SyncIntervalUnit = 'minutes'; reason = ''; friday: boolean | null = null;
}
const CASES = [
  {name: 'History', label: 'Listening history', value: 60, unit: 'minutes', enabled: true, reason: '', friday: null, heights: [102, 166, 254]},
  {name: 'Required', label: 'Short-term stats', value: 1, unit: 'days', enabled: false,
    reason: 'Required by an active Song League. Optional scheduling remains separate.', friday: null, heights: [110, 214, 322]},
  {name: 'League', label: 'Song League playlists', value: 60, unit: 'minutes', enabled: false,
    reason: 'Required by an active Song League. Optional scheduling remains separate.', friday: true, heights: [174, 278, 386]}
] as const;

async function ready(fixture: ReturnType<typeof TestBed.createComponent<NativeTaskHost>>) {
  fixture.detectChanges(); await fixture.whenStable();
  await Promise.all([document.fonts.load('400 14px "Outfit Variable"'), document.fonts.load('600 14px "Outfit Variable"')]);
  await document.fonts.ready;
  await Promise.all([...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLImageElement>('img')].map(image => image.decode()));
}

describe('canonical user task editor native geometry and visuals', () => {
  for (const [index, width] of [866, 324, 254].entries()) {
    for (const state of CASES) {
      it(`renders ${state.name} at ${width}px with native fields and exact assets`, async () => {
        await page.viewport(1000, 600);
        const fixture = TestBed.createComponent(NativeTaskHost);
        fixture.nativeElement.style.width = `${width}px`;
        Object.assign(fixture.componentInstance, {label: state.label, enabled: state.enabled, value: state.value,
          unit: state.unit, reason: state.reason, friday: state.friday});
        await ready(fixture);
        const editor = fixture.nativeElement.querySelector('section') as HTMLElement;
        expect(editor.getBoundingClientRect().width).toBe(width);
        expect(editor.getBoundingClientRect().height).toBe(state.heights[index]);
        expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
        expect(getComputedStyle(editor).backgroundColor).toBe('rgb(18, 24, 20)');
        expect(getComputedStyle(editor).borderColor).toBe('rgb(107, 125, 113)');
        for (const input of editor.querySelectorAll<HTMLInputElement>('input[role="switch"]')) {
          expect(input.getBoundingClientRect().height).toBe(56);
          expect(input.getBoundingClientRect().width).toBe(48);
        }
        const field = editor.querySelector<HTMLInputElement>('input[type="number"]')!;
        const unit = editor.querySelector<HTMLSelectElement>('select')!;
        expect(field.getBoundingClientRect().height).toBe(48); expect(unit.getBoundingClientRect().height).toBe(48);
        expect(unit.value).toBe(state.unit); expect(field.value).toBe(String(state.value));
        expect(getComputedStyle(unit).appearance).toBe('none');
        for (const label of editor.querySelectorAll('.control-field > label, strong')) expect(getComputedStyle(label).fontWeight).toBe('600');
        for (const image of editor.querySelectorAll('img')) {
          expect(image.naturalWidth).toBe(image.classList.contains('unit-chevron') ? 20 : 48);
          expect(image.naturalHeight).toBe(image.classList.contains('unit-chevron') ? 20 : 24);
          expect(image.getBoundingClientRect().width).toBe(image.naturalWidth);
          expect(image.getBoundingClientRect().height).toBe(image.naturalHeight);
        }
        await expect.element(page.elementLocator(editor)).toMatchScreenshot(`task-${state.name}-${width}.png`);
        fixture.destroy();
      });
    }
  }
});
