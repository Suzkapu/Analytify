import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {V2RankHistoryPopupComponent} from './v2-rank-history-popup.component';

describe('Rank history popup workflows', () => {
  beforeEach(() => {vi.useFakeTimers();});
  afterEach(() => {TestBed.resetTestingModule(); vi.useRealTimers();});
  const point = (day: number, rank: number) => ({timestamp: new Date(2026, 8, day, 12).getTime(), rank});
  const saved = [point(5, 7), point(18, 3), point(30, 1)];
  async function render(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({imports: [V2RankHistoryPopupComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2RankHistoryPopupComponent);
    for (const [key, value] of Object.entries({title: 'Test Song', context: 'tracks:short_term:track', ...inputs})) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const close = () => element.querySelector<HTMLButtonElement>('.close-button')!;
    const update = (values: Record<string, unknown>) => {for (const [key, value] of Object.entries(values)) fixture.componentRef.setInput(key, value); fixture.detectChanges();};
    return {fixture, element, close, update};
  }

  it('shows decorative loading content and keeps the final Close action available', async () => {
    const {element, close} = await render({busy: true});
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Loading position history…');
    expect(element.querySelector('.chart-skeleton')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('.progress-icon')?.getAttribute('src')).toBe('assets/design-v2/history-progress.svg');
    expect(element.querySelector('v2-rank-history-plot')).toBeNull();
    expect(close().disabled).toBe(false);
    expect(element.querySelector('.history-dialog')?.lastElementChild).toBe(close());
  });

  it('presents successful empty history without an error or an invented curve', async () => {
    const {element} = await render();
    expect(element.textContent).toContain('No saved positions yet');
    expect(element.textContent).toContain('once daily');
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('svg, .retry-button, .table-toggle')).toBeNull();
  });

  it('shows the actual single date/rank without plotting a line', async () => {
    const {element} = await render({points: [point(18, 3)]});
    expect(element.textContent).toContain('One saved position');
    expect(element.querySelector('time')?.textContent).toBe('18 Sep');
    expect(element.querySelector('time')?.getAttribute('datetime')).toBe('2026-09-18');
    expect(element.querySelector('time')?.getAttribute('aria-label')).toBe('18 Sep 2026');
    expect(element.textContent).toContain('#3');
    expect(element.querySelector('svg, table')).toBeNull();
  });

  it('offers recovery after failure and disables repeat retry while retaining Close', async () => {
    const {fixture, element, close, update} = await render({failed: true});
    const retry = vi.fn(); fixture.componentInstance.retry.subscribe(retry);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('History unavailable');
    const button = element.querySelector<HTMLButtonElement>('.retry-button')!;
    button.click(); expect(retry).toHaveBeenCalledTimes(1);
    update({busy: true, failed: false, retrying: true});
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Retrying saved history…');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent?.trim()).toBe('Retrying…');
    expect(button.querySelector('img')?.getAttribute('src')).toBe('assets/design-v2/history-retry-progress.svg');
    button.click(); expect(retry).toHaveBeenCalledTimes(1);
    expect(close().disabled).toBe(false);
    update({busy: false, retrying: false, points: saved});
    expect(element.querySelector('[role="slider"]')).not.toBeNull();
    expect(element.querySelector('.retry-button')).toBeNull();
  });

  it.each([{points: [point(18, 3)], plot: false}, {points: saved, plot: true}])('retains local positions during failure and retry: %j', async ({points, plot}) => {
    const {element, update} = await render({failed: true, points});
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Showing local positions');
    expect(!!element.querySelector('[role="slider"]')).toBe(plot);
    expect(element.textContent).toContain(plot ? 'View saved positions' : 'One saved position');
    update({busy: true, failed: false, retrying: true});
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Refreshing saved history…');
    expect(!!element.querySelector('[role="slider"]')).toBe(plot);
    expect(element.querySelector('.initial-loading')).toBeNull();
    expect(element.querySelector<HTMLButtonElement>('.retry-button')?.disabled).toBe(true);
  });

  it.each(['tracks', 'artists', 'genres'])('renders the %s category and safe positions', async category => {
    const {element} = await render({category, points: [...saved, point(1, 0), point(2, -2), point(3, 1000), point(4, 1.5), {timestamp: 1e20, rank: 1}]});
    const label = category === 'tracks' ? 'Top Song' : category === 'artists' ? 'Top Artist' : 'Top Genre';
    expect(element.querySelector('.history-header p')?.textContent).toBe(label);
    if (category === 'tracks') expect(element.querySelector('.entity-badge img')?.getAttribute('src')).toBe('assets/design-v2/history-song.svg');
    else expect(element.querySelector('.entity-badge i')?.className).toBe(category === 'artists' ? 'pi pi-user' : 'pi pi-chart-bar');
    expect(element.querySelectorAll('.position-marker')).toHaveLength(3);
  });

  it('discloses every saved date and rank with semantic headers, then hides the table', async () => {
    const {element} = await render({points: saved});
    const toggle = element.querySelector<HTMLButtonElement>('.table-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    TestBed.tick();
    const table = element.querySelector('table')!;
    expect([...table.querySelectorAll('th')].map(n => [n.textContent, n.getAttribute('scope')])).toEqual([['Saved date', 'col'], ['Position', 'col']]);
    expect([...table.querySelectorAll('tbody td:last-child')].map(n => n.textContent)).toEqual(['#7', '#3', '#1']);
    expect(table.querySelector('time')?.getAttribute('datetime')).toBe('2026-09-05');
    expect(table.querySelector('time')?.getAttribute('aria-label')).toBe('5 Sep 2026');
    expect(toggle.getAttribute('aria-controls')).toBe(table.parentElement!.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click(); TestBed.tick();
    expect(element.querySelector('table')).toBeNull();
  });

  it('retains the disclosed table during refresh, and resets inspection/table state for a different item or period', async () => {
    const {element, update} = await render({points: saved});
    element.querySelector<HTMLButtonElement>('.table-toggle')!.click(); TestBed.tick();
    const slider = element.querySelector<HTMLElement>('[role="slider"]')!;
    slider.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true})); TestBed.tick();
    update({busy: true, points: [...saved, point(31, 2)]});
    expect(element.querySelector('table')).not.toBeNull();
    expect(element.querySelector('[role="slider"]')?.getAttribute('aria-valuetext')).toBe('30 Sep 2026, position 1');
    update({context: 'tracks:medium_term:second', title: 'Second Song', busy: false});
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('1');
    expect(element.querySelector('h2')?.textContent).toContain('Second Song');
  });

  it.each([0, 1])('moves focus to Close when refreshed data removes a focused chart with %s retained positions', async count => {
    const {element, close, update} = await render({points: saved});
    vi.runOnlyPendingTimers();
    element.querySelector<HTMLElement>('[role="slider"]')!.focus();
    update({points: saved.slice(0, count)});
    TestBed.tick();
    expect(element.querySelector('[role="slider"]')).toBeNull();
    expect(document.activeElement).toBe(close());
    expect(element.textContent).toContain(count ? 'One saved position' : 'No saved positions yet');
  });

  it('returns focus to Close when a refresh removes the focused table disclosure', async () => {
    const {element, close, update} = await render({points: saved});
    vi.runOnlyPendingTimers();
    const toggle = element.querySelector<HTMLButtonElement>('.table-toggle')!;
    toggle.click(); TestBed.tick(); toggle.focus();
    update({points: []});
    TestBed.tick();
    expect(element.querySelector('.table-toggle, table')).toBeNull();
    expect(document.activeElement).toBe(close());
  });

  it('keeps focus inside when successful recovery removes the focused Retry control', async () => {
    const {element, close, update} = await render({failed: true});
    vi.runOnlyPendingTimers(); element.querySelector<HTMLButtonElement>('.retry-button')!.focus();
    update({failed: false, points: saved});
    TestBed.tick();
    expect(element.querySelector('.retry-button')).toBeNull();
    expect(document.activeElement).toBe(close());
  });

  it('keeps focus on Close when starting a retry disables its focused control', async () => {
    const {element, close, update} = await render({failed: true});
    vi.runOnlyPendingTimers(); element.querySelector<HTMLButtonElement>('.retry-button')!.focus();
    update({busy: true, failed: false, retrying: true}); TestBed.tick();
    expect(element.querySelector<HTMLButtonElement>('.retry-button')!.disabled).toBe(true);
    expect(document.activeElement).toBe(close());
  });

  it('recovers to Close when a context change replaces the focused plot', async () => {
    const {element, close, update} = await render({points: saved});
    vi.runOnlyPendingTimers(); const plot = element.querySelector<HTMLElement>('[role="slider"]')!; plot.focus();
    update({context: 'artists:long_term:other', category: 'artists', title: 'Other Artist'}); TestBed.tick();
    expect(element.querySelector('[role="slider"]')).not.toBe(plot);
    expect(document.activeElement).toBe(close());
    expect(element.querySelector('h2')?.textContent).toContain('Other Artist');
  });

  it('retains focused plot and Close controls during ordinary history refreshes', async () => {
    const {element, close, update} = await render({points: saved});
    vi.runOnlyPendingTimers(); const plot = element.querySelector<HTMLElement>('[role="slider"]')!; plot.focus();
    update({points: [...saved, point(31, 2)], busy: true}); TestBed.tick();
    expect(document.activeElement).toBe(plot);
    close().focus(); update({points: []}); TestBed.tick();
    expect(document.activeElement).toBe(close());
  });

  it('closes only for backdrop, Close or Escape and restores the trigger focus', async () => {
    const trigger = document.createElement('button'); trigger.textContent = 'History'; document.body.appendChild(trigger); trigger.focus();
    const {fixture, element, close} = await render({points: saved});
    const dismiss = vi.fn(); fixture.componentInstance.dismiss.subscribe(dismiss);
    vi.runOnlyPendingTimers();
    expect(document.activeElement).toBe(close());
    element.querySelector<HTMLElement>('.history-heading')!.click(); expect(dismiss).not.toHaveBeenCalled();
    element.querySelector<HTMLElement>('.history-overlay')!.click(); expect(dismiss).toHaveBeenCalledTimes(1);
    close().click(); expect(dismiss).toHaveBeenCalledTimes(2);
    fixture.componentInstance.dismiss.subscribe(() => fixture.destroy());
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    expect(dismiss).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
