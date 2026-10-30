import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {AdminUserCardComponent} from './admin-user-card.component';
import {AdminUserScheduleDraft} from './admin-user-interval-validation';

function user(overrides: Partial<AdminUserScheduleDraft> = {}): AdminUserScheduleDraft {
  return {
    userId: 'synthetic-alice', spotifyId: 'synthetic-listener', displayName: 'Synthetic listener', profilePicUrl: '',
    backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'Europe/Vienna',
    historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
    shortTermEnabled: false, shortTermIntervalHours: 1, shortTermIntervalUnit: 'days',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days',
    longTermEnabled: false, longTermIntervalHours: 7, longTermIntervalUnit: 'days',
    songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
    songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: true, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastSuccessAt: null, lastError: null,
    requiredTasks: {stats_short_term: 'Required by an active Song League.', shared_playlists: 'Required by a shared playlist.'},
    ...overrides
  };
}

async function mount(inputs: Record<string, unknown> = {}, draft = user()) {
  await TestBed.configureTestingModule({imports: [AdminUserCardComponent]}).compileComponents();
  const fixture = TestBed.createComponent(AdminUserCardComponent);
  fixture.componentRef.setInput('user', draft);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const outputs = {toggle: vi.fn(), save: vi.fn(), run: vi.fn(), review: vi.fn(), refresh: vi.fn()};
  fixture.componentInstance.disclosureToggle.subscribe(outputs.toggle);
  for (const name of ['save', 'run', 'review', 'refresh'] as const) fixture.componentInstance[name].subscribe(outputs[name]);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  const button = (text: string) => [...page.querySelectorAll<HTMLButtonElement>('button')].find(control => control.textContent?.trim() === text)!;
  const labelled = (label: string) => [...page.querySelectorAll<HTMLInputElement>('input')].find(control =>
    control.getAttribute('aria-label') === label || [...page.querySelectorAll('label')].some(item => item.control === control && item.textContent?.trim() === label))!;
  async function edit(control: HTMLInputElement, value: string) {
    expect(control).toBeTruthy(); control.value = value; control.dispatchEvent(new Event('input', {bubbles: true}));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  return {fixture, page, button, labelled, edit, draft, ...outputs};
}

describe('identified administration user card', () => {
  it('identifies the actual user and exposes only its disclosure while collapsed', async () => {
    const {page, toggle, save, run} = await mount();
    expect(page.querySelector('article.admin-user-card')).not.toBeNull();
    expect(page.querySelector('h3')?.textContent).toBe('Synthetic listener');
    expect(page.textContent).toContain('synthetic-listener');
    const disclosure = page.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    expect(disclosure.getAttribute('aria-label')).toBe('Expand Synthetic listener settings');
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(page.querySelectorAll('input,select,textarea')).toHaveLength(0);
    expect(page.querySelectorAll('button')).toHaveLength(1);
    disclosure.click(); expect(toggle).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(save).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });

  it('counts selected optional tasks independently of the master and actual feature requirements', async () => {
    const {fixture, page, draft} = await mount({}, user({enabled: false}));
    expect(page.textContent).toContain('2 optional schedules selected · 2 feature-required tasks.');
    expect(draft.enabled).toBe(false);
    fixture.componentRef.setInput('user', user({historyEnabled: false, sharedPlaylistsEnabled: false, requiredTasks: {}}));
    fixture.detectChanges();
    expect(page.textContent).toContain('No optional schedules selected · No required tasks.');
  });

  it('announces one selected optional schedule and one nonempty known requirement in singular form', async () => {
    const {page} = await mount({}, user({sharedPlaylistsEnabled: false,
      requiredTasks: {stats_short_term: 'Required by an active Song League.', shared_playlists: '   '}}));
    expect(page.textContent).toContain('1 optional schedule selected · 1 feature-required task.');
  });

  it('does not claim history or medium/long stats as feature-required work from unsupported metadata', async () => {
    const {page} = await mount({}, user({requiredTasks: {listening_history: 'Unsupported feature requirement',
      stats_medium_term: 'Unsupported feature requirement', stats_long_term: 'Unsupported feature requirement'}}));
    expect(page.textContent).toContain('No required tasks.');
  });

  it('keeps the parent draft across collapse and re-expansion and addresses the disclosed region', async () => {
    const {fixture, page, labelled, edit, draft} = await mount({expanded: true});
    await edit(labelled('Schedule timezone'), 'Europe/London');
    expect(draft.timezone).toBe('Europe/London');
    const disclosure = page.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    expect(disclosure.getAttribute('aria-label')).toBe('Collapse Synthetic listener settings');
    expect(page.querySelector(`[id="${disclosure.getAttribute('aria-controls')}"]`)).not.toBeNull();
    fixture.componentRef.setInput('expanded', false); fixture.detectChanges();
    expect(page.querySelector('input')).toBeNull();
    fixture.componentRef.setInput('expanded', true); fixture.detectChanges(); await fixture.whenStable();
    expect(labelled('Schedule timezone').value).toBe('Europe/London');
  });

  it('edits timezone, optional master, interval and Friday drafts locally until Save is activated', async () => {
    const {page, labelled, edit, draft, save, run, button} = await mount({expanded: true});
    await edit(labelled('Schedule timezone'), 'UTC');
    await edit(labelled('Listening history interval'), '120');
    page.querySelector<HTMLElement>('[aria-label="Enable optional administrator schedules"]')!.click();
    page.querySelector<HTMLElement>('[aria-label="Refresh Song League playlists only on Fridays"]')!.click();
    expect(draft.timezone).toBe('UTC'); expect(draft.historyIntervalMinutes).toBe(120);
    expect(draft.enabled).toBe(false); expect(draft.songLeaguePlaylistFridaysOnly).toBe(false);
    expect(save).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
    button('Save').click(); expect(save).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(run).not.toHaveBeenCalled();
  });

  it('retains a blank interval as null and never silently repairs it in the view', async () => {
    const {labelled, edit, draft, save} = await mount({expanded: true});
    await edit(labelled('Listening history interval'), '');
    expect(draft.historyIntervalMinutes).toBeNull(); expect(save).not.toHaveBeenCalled();
  });

  it('dispatches Run independently and blocks duplicate save/run activation while busy without freezing edits', async () => {
    const {fixture, button, labelled, edit, draft, save, run} = await mount({expanded: true});
    button('Run enabled tasks').click(); expect(run).toHaveBeenCalledExactlyOnceWith(undefined); expect(save).not.toHaveBeenCalled();
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    for (const name of ['Save', 'Run enabled tasks']) {expect(button(name).disabled).toBe(true); button(name).click();}
    expect(run).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
    expect(labelled('Schedule timezone').disabled).toBe(false);
    await edit(labelled('Listening history interval'), '121'); expect(draft.historyIntervalMinutes).toBe(121);
    fixture.componentRef.setInput('busy', false); fixture.detectChanges();
    button('Save').click(); expect(save).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('keeps independently required task reasons visible when optional schedules are off', async () => {
    const {page, draft} = await mount({expanded: true}, user({enabled: false, shortTermEnabled: false}));
    expect(page.querySelectorAll('v2-admin-user-task-editor')).toHaveLength(6);
    expect(page.textContent).toContain('Required by an active Song League.');
    expect(page.textContent).toContain('Required by a shared playlist.');
    expect(draft.requiredTasks?.stats_short_term).toBe('Required by an active Song League.');
    expect(page.querySelector('input[value="Required by an active Song League."]')).toBeNull();
  });

  it('shows all three service-supported requirements independently of disabled optional work', async () => {
    const reasons = {stats_short_term: 'Short stats required for a league.',
      song_league_playlists: 'Playlist required for an active league.', shared_playlists: 'Shared playlist refresh required.'};
    const {page, draft} = await mount({expanded: true}, user({requiredTasks: reasons, enabled: false,
      historyEnabled: false, sharedPlaylistsEnabled: false}));
    for (const reason of Object.values(reasons)) expect(page.textContent).toContain(reason);
    expect(page.textContent).toContain('No optional schedules selected · 3 feature-required tasks.');
    expect(draft.requiredTasks).toEqual(reasons);
    expect([...page.querySelectorAll<HTMLInputElement>('[aria-label^="Enable optional"]')].every(control => !control.checked)).toBe(true);
  });

  it.each([{backupActive: false}, {hasRefreshToken: false}])('explains unavailable Run while retaining Save for account capability %j', async capabilities => {
    const {page, button, save, run} = await mount({expanded: true}, user(capabilities));
    expect(button('Run enabled tasks').disabled).toBe(true); button('Run enabled tasks').click(); expect(run).not.toHaveBeenCalled();
    expect(page.textContent?.toLowerCase()).toMatch(/backup|reconnect/);
    expect(button('Save').disabled).toBe(false); button('Save').click(); expect(save).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('offers pending-registration review as a separate action without authorizing deletion', async () => {
    const {fixture, page, button, review, run, save} = await mount({expanded: true}, user({spotifyId: 'pending:synthetic-profile'}));
    expect(page.querySelector('h3')?.textContent).toBe('Incomplete registration');
    expect(button('Run enabled tasks').disabled).toBe(true);
    button('Review incomplete registration').click(); expect(review).toHaveBeenCalledExactlyOnceWith(button('Review incomplete registration'));
    expect(run).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    expect([...page.querySelectorAll('button')].some(control => /delete/i.test(control.textContent ?? ''))).toBe(false);
    fixture.componentRef.setInput('reviewBusy', true); fixture.detectChanges();
    expect(button('Review incomplete registration').disabled).toBe(true);
    button('Review incomplete registration').click(); expect(review).toHaveBeenCalledTimes(1);
  });

  it('replaces Save with read-only recovery and blocks repeated recovery while busy', async () => {
    const {fixture, page, button, refresh, save} = await mount({expanded: true, refreshRequired: true, state: 'read-error'});
    expect(button('Save')).toBeUndefined();
    expect(page.textContent).toContain('Settings saved · Refresh needed');
    button('Refresh user settings').click(); expect(refresh).toHaveBeenCalledExactlyOnceWith(undefined); expect(save).not.toHaveBeenCalled();
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    expect(button('Refresh user settings').disabled).toBe(true); button('Refresh user settings').click(); expect(refresh).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('busy', false); fixture.componentRef.setInput('refreshRequired', false); fixture.componentRef.setInput('state', 'saved'); fixture.detectChanges();
    expect(button('Refresh user settings')).toBeUndefined(); expect(button('Save')).toBeTruthy();
    expect(page.textContent).toContain('Settings saved'); expect(page.textContent).not.toContain('Refresh needed');
  });

  it('renders hostile and long identity/error strings literally without manufacturing truncated identities', async () => {
    const name = '<script>not executable</script> ' + 'Long synthetic name '.repeat(20), error = '<img src=x onerror=alert(1)>';
    const {page} = await mount({expanded: true}, user({displayName: name, lastError: error}));
    expect(page.querySelector('h3')?.textContent).toBe(name); expect(page.textContent).toContain(error);
    expect(page.querySelector('script,img[onerror]')).toBeNull();
  });

  it('uses a shared fallback avatar and recovers from a failed supplied image', async () => {
    const {fixture, page} = await mount({}, user({profilePicUrl: 'https://synthetic.invalid/avatar.png'}));
    const image = page.querySelector<HTMLImageElement>('img[src="https://synthetic.invalid/avatar.png"]')!;
    expect(image).not.toBeNull(); image.dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(page.querySelector('img[src="https://synthetic.invalid/avatar.png"]')).toBeNull();
    expect([...page.querySelectorAll<HTMLImageElement>('img')].some(item => item.getAttribute('src')?.startsWith('assets/design-v2/'))).toBe(true);
  });

  it('tries a replacement avatar URL after an earlier supplied image failed', async () => {
    const {fixture, page} = await mount({}, user({profilePicUrl: 'https://synthetic.invalid/old.png'}));
    page.querySelector<HTMLImageElement>('img[src="https://synthetic.invalid/old.png"]')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    fixture.componentRef.setInput('user', user({profilePicUrl: 'https://synthetic.invalid/new.png'})); fixture.detectChanges();
    expect(page.querySelector('img[src="https://synthetic.invalid/old.png"]')).toBeNull();
    expect(page.querySelector('img[src="https://synthetic.invalid/new.png"]')).not.toBeNull();
  });

  it('never renders semantic times for impossible or missing timestamps', async () => {
    const {page} = await mount({expanded: true}, user({lastSuccessAt: '2026-02-30T12:00:00Z', nextEffectiveRunAt: 'not-a-time'}));
    expect(page.querySelector('time')).toBeNull(); expect(page.textContent).not.toContain('Invalid Date');
  });

  it('keeps disclosure regions and labelled controls uniquely associated across two users', async () => {
    @Component({standalone: true, imports: [AdminUserCardComponent], template: `
      <v2-admin-user-card [user]="alice" [expanded]="true" />
      <v2-admin-user-card [user]="bob" [expanded]="true" />`})
    class TwoCards {alice = user(); bob = user({userId: 'synthetic-bob', spotifyId: 'synthetic-bob', displayName: 'Bob'});}
    await TestBed.configureTestingModule({imports: [TwoCards]}).compileComponents();
    const fixture = TestBed.createComponent(TwoCards); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const ids = [...page.querySelectorAll<HTMLElement>('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const disclosure of page.querySelectorAll('[aria-expanded]')) expect(page.querySelector(`[id="${disclosure.getAttribute('aria-controls')}"]`)).not.toBeNull();
    for (const field of page.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[type="number"],input[type="text"],select')) {
      expect([...page.querySelectorAll('label')].some(label => label.control === field)).toBe(true);
    }
  });
});
