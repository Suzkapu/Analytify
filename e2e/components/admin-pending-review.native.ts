import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {AdminPendingReviewDialogComponent} from '../../src/app/features/admin/admin-pending-review-dialog.component';
import {AdminPendingReviewPhase, AdminPendingReviewView} from '../../src/app/features/admin/admin-pending-review-state';

const phases: AdminPendingReviewPhase[] = ['reviewing', 'blocked', 'eligible', 'deleting', 'review-error',
  'delete-error', 'deleted-read-error', 'deleted-refreshing', 'reconciling'];
const naturalHeights = [[218, 242], [258, 278], [326, 350], [238, 262], [302, 326],
  [326, 350], [326, 350], [238, 262], [238, 262]];
function view(phase: AdminPendingReviewPhase): AdminPendingReviewView {
  return {phase, userId: 'synthetic-user', displayName: 'Synthetic user', spotifyId: 'pending:synthetic-profile',
    createdAt: '2026-10-24T08:00:00Z',
    blockers: phase === 'blocked' ? ['Cloud Backup or Spotify credentials are connected.', 'Linked data was found.'] : [],
    message: phase === 'review-error' ? 'The review service could not be reached.'
      : phase === 'delete-error' ? 'The connection was interrupted.' : ''};
}
@Component({standalone: true, imports: [AdminPendingReviewDialogComponent],
  template: `<div class="design-v2"><button (click)="open = true">Open review</button>
    @if (open) {<v2-admin-pending-review-dialog [view]="view" />}</div>`,
  styleUrl: '../../src/app/shared/layout/design-v2-shell/design-v2-shell.component.scss'})
class NativeReviewHost {open = false; view = view('eligible');}

async function render(phase: AdminPendingReviewPhase, width: number, height: number, longIdentity = false) {
  await page.viewport(width, height);
  expect(window.parent.innerWidth).toBeGreaterThanOrEqual(width);
  expect(window.parent.innerHeight).toBeGreaterThanOrEqual(height);
  const fixture = TestBed.createComponent(NativeReviewHost);
  fixture.componentInstance.view = view(phase);
  if (longIdentity) fixture.componentInstance.view.spotifyId = `pending:${'synthetic-registration-'.repeat(50)}`;
  fixture.detectChanges(); await fixture.whenStable();
  await Promise.all([document.fonts.load('400 14px "Outfit Variable"'), document.fonts.load('400 16px "Outfit Variable"'),
    document.fonts.load('600 14px "Outfit Variable"'), document.fonts.load('600 20px "Outfit Variable"')]);
  await page.elementLocator(fixture.nativeElement.querySelector('button')).click();
  fixture.detectChanges(); await fixture.whenStable(); await document.fonts.ready;
  const panel = fixture.nativeElement.querySelector('.review-panel') as HTMLElement;
  const overlay = fixture.nativeElement.querySelector('.review-overlay') as HTMLElement;
  const body = panel.querySelector('.review-body') as HTMLElement;
  const footer = panel.querySelector('footer')!;
  const box = panel.getBoundingClientRect(), bodyBox = body.getBoundingClientRect(), footerBox = footer.getBoundingClientRect();
  expect(box.width).toBe(Math.min(576, width - 32));
  expect(box.top).toBeGreaterThanOrEqual(16); expect(box.bottom).toBeLessThanOrEqual(height - 16);
  expect(box.left).toBe((width - box.width) / 2); expect(box.top).toBe((height - box.height) / 2);
  expect(getComputedStyle(overlay).backdropFilter).toBe('blur(12px)');
  expect(getComputedStyle(overlay).backgroundColor).toBe('rgba(0, 0, 0, 0.48)');
  expect(getComputedStyle(panel).backgroundColor).toBe('rgb(11, 16, 13)');
  expect(getComputedStyle(panel).borderRadius).toBe('24px');
  expect(getComputedStyle(panel.querySelector('.review-details p')!).color).toBe('rgb(142, 155, 146)');
  expect(bodyBox.bottom + 16).toBe(footerBox.top);
  expect(footerBox.bottom).toBe(box.bottom - 25);
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  const buttons = [...footer.querySelectorAll('button')];
  for (const button of buttons) {
    expect(button.getBoundingClientRect().height).toBe(48);
    expect(button.getBoundingClientRect().width).toBe(box.width - 50);
    expect(getComputedStyle(button).fontWeight).toBe('600');
  }
  expect(buttons.at(-1)?.hasAttribute('appModalInitialFocus')).toBe(true);
  if (longIdentity) {
    expect(box.height).toBe(height - 32);
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    expect(getComputedStyle(body).overflowY).toBe('auto');
  } else if (width !== 320) expect(box.height).toBe(naturalHeights[phases.indexOf(phase)][width === 390 ? 1 : 0]);
  await expect.element(page.elementLocator(panel)).toMatchScreenshot(`pending-${phase}-${width}x${height}${longIdentity ? '-long' : ''}.png`);
  fixture.destroy();
}

describe('canonical pending registration review panels', () => {
  for (const width of [1100, 390]) for (const phase of phases) it(`${phase} at ${width}px`, async () => {
    await render(phase, width, 1000);
  });
  for (const width of [1100, 390]) it(`long reviewed identity keeps both actions reachable at ${width}x480`, async () => {
    await render('eligible', width, 480, true);
  });
  for (const height of [480, 1000]) it(`compact review at 320x${height}`, async () => {
    await render('eligible', 320, height);
  });
});
