import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {AdminUserCardComponent} from '../../src/app/features/admin/admin-user-card.component';
import {AdminUserScheduleDraft} from '../../src/app/features/admin/admin-user-interval-validation';

function canonicalUser(): AdminUserScheduleDraft {
  return {userId: 'synthetic-user', spotifyId: 'synthetic-listener', displayName: 'Synthetic listener', profilePicUrl: '',
    backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'Europe/Vienna',
    historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
    shortTermEnabled: false, shortTermIntervalHours: 1, shortTermIntervalUnit: 'days',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days',
    longTermEnabled: false, longTermIntervalHours: 7, longTermIntervalUnit: 'days',
    songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true, songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: true, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    requiredTasks: {stats_short_term: 'Required by an active Song League.', song_league_playlists: 'Required by an active Song League.', shared_playlists: 'Required by a shared playlist.'},
    lastSuccessAt: '2026-10-24T08:00:00Z', nextEffectiveRunAt: '2026-10-24T09:00:00Z', manualJobRetained: true, lastError: null};
}
@Component({standalone: true, imports: [AdminUserCardComponent],
  template: `<div class="design-v2"><v2-admin-user-card [user]="user" [expanded]="expanded" /></div>`,
  styleUrl: '../../src/app/shared/layout/design-v2-shell/design-v2-shell.component.scss'})
class NativeCardHost {user = canonicalUser(); expanded = false;}

const CAPABILITIES = [
  {name: 'Ready', patch: {}, collapsed: [166, 186], expanded: [1298, 1882]},
  {name: 'Backup-off', patch: {backupActive: false, nextEffectiveRunAt: null, manualJobRetained: false}, collapsed: [166, 186], expanded: [1278, 1862]},
  {name: 'Reconnect', patch: {hasRefreshToken: false, nextEffectiveRunAt: null, manualJobRetained: false}, collapsed: [166, 186], expanded: [1278, 1862]},
  {name: 'Pending', patch: {spotifyId: 'pending:synthetic-profile', backupActive: false, hasRefreshToken: false,
    enabled: false, historyEnabled: false, sharedPlaylistsEnabled: false, requiredTasks: {}, lastSuccessAt: null, nextEffectiveRunAt: null, manualJobRetained: false},
    collapsed: [166, 230], expanded: [1218, 1806]}
] as const;

async function ready(fixture: ReturnType<typeof TestBed.createComponent<NativeCardHost>>) {
  fixture.detectChanges(); await fixture.whenStable();
  await Promise.all([document.fonts.load('400 14px "Outfit Variable"'), document.fonts.load('600 20px "Outfit Variable"')]);
  await document.fonts.ready;
  await Promise.all([...(fixture.nativeElement as HTMLElement).querySelectorAll('img')].map(image => image.decode()));
}

async function assertCard(fixture: ReturnType<typeof TestBed.createComponent<NativeCardHost>>, width: number, height: number, name: string) {
  await ready(fixture);
  expect(window.parent.innerHeight).toBeGreaterThanOrEqual(3000);
  expect(window.parent.innerWidth).toBeGreaterThanOrEqual(1100);
  const card = (fixture.nativeElement as HTMLElement).querySelector('article')!;
  expect(card.getBoundingClientRect().width).toBe(width); expect(card.getBoundingClientRect().height).toBe(height);
  expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
  expect(getComputedStyle(card).backgroundColor).toBe('rgb(24, 32, 25)');
  expect(getComputedStyle(card).borderColor).toBe('rgb(107, 125, 113)');
  for (const container of [card, ...card.querySelectorAll<HTMLElement>('.card-settings')]) {
    const children = [...container.children].map(child => child.getBoundingClientRect());
    const bounds = container.getBoundingClientRect();
    for (const child of children) {
      expect(child.x).toBeGreaterThanOrEqual(bounds.x);
      expect(child.right).toBeLessThanOrEqual(bounds.right);
    }
    for (let index = 1; index < children.length; index++) expect(children[index].top - children[index - 1].bottom).toBe(16);
  }
  const disclosure = card.querySelector<HTMLButtonElement>('[aria-expanded]')!;
  expect(disclosure.getBoundingClientRect().width).toBe(48); expect(disclosure.getBoundingClientRect().height).toBe(48);
  expect(getComputedStyle(card.querySelector('h3')!).fontWeight).toBe('600');
  expect(getComputedStyle(card.querySelector('h3')!).fontSize).toBe('20px');
  for (const button of card.querySelectorAll('button')) {
    expect(button.getBoundingClientRect().height).toBe(48); expect(getComputedStyle(button).fontWeight).toBe('600');
  }
  for (const image of card.querySelectorAll('img')) {
    expect(image.complete && image.naturalWidth > 0).toBe(true);
    expect(image.getBoundingClientRect().width).toBe(image.naturalWidth);
    expect(image.getBoundingClientRect().height).toBe(image.naturalHeight);
  }
  if (fixture.componentInstance.expanded) {
    const actions = [...card.querySelectorAll<HTMLButtonElement>('footer button')];
    const busy = !fixture.componentInstance.user.backupActive || !fixture.componentInstance.user.hasRefreshToken;
    expect(actions[0].textContent?.trim()).toBe('Save');
    expect(actions[1].textContent?.trim()).toBe('Run enabled tasks'); expect(actions[1].disabled).toBe(busy);
    expect(card.querySelectorAll('v2-admin-user-task-editor')).toHaveLength(6);
    expect(actions[0].getBoundingClientRect().width).toBe(width > 600 ? 144 : width - 34);
    expect(actions[1].getBoundingClientRect().width).toBe(width > 600 ? 220 : width - 34);
    if (busy) expect(getComputedStyle(actions[1]).opacity).toBe('0.45');
  } else expect(card.querySelectorAll('input,select')).toHaveLength(0);
  await expect.element(page.elementLocator(card)).toMatchScreenshot(`card-${name}-${width}.png`);
  fixture.destroy();
}

describe('canonical identified user schedule cards', () => {
  for (const [index, width] of [900, 358].entries()) for (const capability of CAPABILITIES) for (const expanded of [false, true]) {
    it(`renders ${capability.name} ${expanded ? 'expanded' : 'collapsed'} at ${width}px`, async () => {
      await page.viewport(1100, 3000);
      const fixture = TestBed.createComponent(NativeCardHost); fixture.nativeElement.style.width = `${width}px`;
      fixture.componentInstance.user = {...canonicalUser(), ...capability.patch}; fixture.componentInstance.expanded = expanded;
      await assertCard(fixture, width, (expanded ? capability.expanded : capability.collapsed)[index], `${capability.name}-${expanded ? 'expanded' : 'collapsed'}`);
    });
  }
  for (const expanded of [false, true]) it(`renders Ready ${expanded ? 'expanded' : 'collapsed'} at compact288px`, async () => {
    await page.viewport(1100, 3000);
    const fixture = TestBed.createComponent(NativeCardHost); fixture.nativeElement.style.width = '288px'; fixture.componentInstance.expanded = expanded;
    await assertCard(fixture, 288, expanded ? 2574 : 250, `Ready-${expanded ? 'expanded' : 'collapsed'}`);
  });
});
