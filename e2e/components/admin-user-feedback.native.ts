import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {AdminUserSaveFeedbackComponent} from '../../src/app/features/admin/admin-user-save-feedback.component';
import {AdminUserRefreshActionComponent} from '../../src/app/features/admin/admin-user-refresh-action.component';
import {AdminUserSaveState} from '../../src/app/features/admin/admin-user-save-state';

@Component({standalone: true, imports: [AdminUserSaveFeedbackComponent, AdminUserRefreshActionComponent],
  template: `<div class="design-v2">@if (action) {<v2-admin-user-refresh-action />} @else {<v2-admin-user-save-feedback [state]="state" />}</div>`,
  styleUrl: '../../src/app/shared/layout/design-v2-shell/design-v2-shell.component.scss'})
class NativeUserFeedbackHost {
  state: AdminUserSaveState = 'saving';
  action = false;
}

async function ready(fixture: ReturnType<typeof TestBed.createComponent<NativeUserFeedbackHost>>) {
  fixture.detectChanges(); await fixture.whenStable();
  await Promise.all([document.fonts.load('400 14px "Outfit Variable"'), document.fonts.load('600 14px "Outfit Variable"')]);
  await document.fonts.ready;
  await Promise.all([...fixture.nativeElement.querySelectorAll('img')].map((image: HTMLImageElement) => image.decode()));
}

describe('canonical native user schedule save and recovery', () => {
  for (const width of [900, 358]) {
    for (const state of ['validation', 'saving', 'refreshing', 'saved', 'newer-draft', 'save-error', 'read-error'] as const) {
      it(`renders ${state} feedback at ${width}px`, async () => {
        await page.viewport(1000, 600);
        const fixture = TestBed.createComponent(NativeUserFeedbackHost);
        fixture.nativeElement.style.width = `${width}px`; fixture.componentInstance.state = state;
        await ready(fixture);
        const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
        const height = width === 900 || ['saved', 'newer-draft'].includes(state) ? 82 : state === 'read-error' ? 122 : 102;
        expect(status.getBoundingClientRect().width).toBe(width);
        expect(status.getBoundingClientRect().height).toBe(height);
        expect(getComputedStyle(status).backgroundColor).toBe('rgb(24, 32, 25)');
        expect(getComputedStyle(status).borderColor).toBe('rgb(119, 184, 255)');
        expect(status.querySelector('button, a, input, select')).toBeNull();
        expect(status.getAttribute('aria-busy') === 'true').toBe(['saving', 'refreshing'].includes(state));
        await expect.element(page.elementLocator(status)).toMatchScreenshot(`user-${state}-${width}.png`);
        fixture.destroy();
      });
    }
    it(`renders the independent recovery action in ${width}px space`, async () => {
      await page.viewport(1000, 600);
      const fixture = TestBed.createComponent(NativeUserFeedbackHost);
      fixture.nativeElement.style.width = `${width}px`; fixture.componentInstance.action = true;
      await ready(fixture);
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(button.getBoundingClientRect().width).toBe(220);
      expect(button.getBoundingClientRect().height).toBe(48);
      expect(getComputedStyle(button).fontWeight).toBe('600');
      expect(getComputedStyle(button).backgroundColor).toBe('rgb(18, 24, 20)');
      expect(button.textContent?.trim()).toBe('Refresh user settings');
      const icon = button.querySelector('img')!;
      expect(icon.naturalWidth).toBe(18); expect(icon.naturalHeight).toBe(18);
      expect(icon.getBoundingClientRect().width).toBe(18); expect(icon.getBoundingClientRect().height).toBe(18);
      await expect.element(page.elementLocator(button)).toMatchScreenshot(`user-refresh-action-${width}.png`);
      fixture.destroy();
    });
  }
});
