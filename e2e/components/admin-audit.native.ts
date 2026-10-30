import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {AdminSyncRun} from '../../src/app/core/admin/admin.models';
import {AdminRunRecordComponent} from '../../src/app/features/admin/admin-run-record.component';
import {AdminRunFeedbackComponent, AdminRunFeedbackState} from '../../src/app/features/admin/admin-run-feedback.component';

const BASE: AdminSyncRun = {id: 'canonical-run', userId: 'synthetic-user', displayName: 'Synthetic listener',
  taskKey: 'listening_history', status: 'succeeded', triggerType: 'manual', requestedAt: '2026-10-24T08:00:00Z',
  startedAt: '2026-10-24T08:00:01Z', finishedAt: '2026-10-24T08:00:09Z', error: null, details: {}};
const RECORDS: {name: string; run: AdminSyncRun; label: string; heights: number[]}[] = [
  {name: 'Queued', run: {...BASE, status: 'queued', startedAt: null, finishedAt: null}, label: 'Listening history', heights: [174, 174]},
  {name: 'Running', run: {...BASE, status: 'running', finishedAt: null}, label: 'Listening history', heights: [202, 202]},
  {name: 'Succeeded', run: BASE, label: 'Listening history', heights: [202, 202]},
  {name: 'Failed', run: {...BASE, status: 'failed', error: 'Provider request failed. Previous saved data was kept.'}, label: 'Listening history', heights: [230, 250]},
  {name: 'Cancelled', run: {...BASE, status: 'cancelled', triggerType: 'scheduled', startedAt: null, finishedAt: null,
    error: 'Cancelled because Listening History was disabled by the administrator.'}, label: 'Listening history', heights: [202, 222]},
  {name: 'Warning', run: {...BASE, taskKey: 'shared_playlists', details: {warnings: ['This playlist exceeds 5000 songs. Its previous shared version was kept.']}}, label: 'Shared playlists', heights: [230, 250]}
];

@Component({standalone: true, imports: [AdminRunRecordComponent, AdminRunFeedbackComponent],
  template: `<div class="design-v2">@if (mode === 'record') {<v2-admin-run-record [run]="run" [label]="label" />} @else {<v2-admin-run-feedback [state]="state" />}</div>`,
  styleUrl: '../../src/app/shared/layout/design-v2-shell/design-v2-shell.component.scss'})
class NativeAuditHost {
  mode: 'record' | 'feedback' = 'record';
  run = BASE;
  label = 'Listening history';
  state: AdminRunFeedbackState = 'empty';
}

async function ready(fixture: ReturnType<typeof TestBed.createComponent<NativeAuditHost>>) {
  fixture.detectChanges();
  await fixture.whenStable();
  await Promise.all([document.fonts.load('400 14px "Outfit Variable"'), document.fonts.load('600 14px "Outfit Variable"')]);
  await document.fonts.ready;
}

describe('canonical native Administration audit components', () => {
  for (const [index, width] of [900, 358].entries()) {
    for (const record of RECORDS) {
      it(`renders ${record.name} audit record at ${width}px`, async () => {
        await page.viewport(1000, 600);
        const fixture = TestBed.createComponent(NativeAuditHost);
        fixture.nativeElement.style.width = `${width}px`;
        fixture.componentInstance.run = record.run;
        fixture.componentInstance.label = record.label;
        await ready(fixture);
        const card = fixture.nativeElement.querySelector('article') as HTMLElement;
        expect(card.getBoundingClientRect().width).toBe(width);
        expect(card.getBoundingClientRect().height).toBe(record.heights[index]);
        expect(getComputedStyle(card).backgroundColor).toBe('rgb(24, 32, 25)');
        expect(getComputedStyle(card).borderColor).toBe('rgb(107, 125, 113)');
        expect(getComputedStyle(card).fontFamily).toContain('Outfit Variable');
        expect(card.querySelector('button, input, select, a')).toBeNull();
        await expect.element(page.elementLocator(card)).toMatchScreenshot(`record-${record.name}-${width}.png`);
        fixture.destroy();
      });
    }
    for (const state of ['loading', 'refreshing', 'empty', 'load-error', 'refresh-error'] as const) {
      it(`renders ${state} audit feedback at ${width}px`, async () => {
        await page.viewport(1000, 600);
        const fixture = TestBed.createComponent(NativeAuditHost);
        fixture.nativeElement.style.width = `${width}px`;
        fixture.componentInstance.mode = 'feedback'; fixture.componentInstance.state = state;
        await ready(fixture);
        const feedback = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
        expect(feedback.getBoundingClientRect().width).toBe(width);
        expect(feedback.getBoundingClientRect().height).toBe(width === 358 && state !== 'loading' ? 102 : 82);
        expect(getComputedStyle(feedback).backgroundColor).toBe('rgb(24, 32, 25)');
        expect(getComputedStyle(feedback).borderColor).toBe('rgb(119, 184, 255)');
        expect(feedback.querySelector('button, input, select, a')).toBeNull();
        await expect.element(page.elementLocator(feedback)).toMatchScreenshot(`feedback-${state}-${width}.png`);
        fixture.destroy();
      });
    }
  }
});
