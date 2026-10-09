import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {SnapshotCalendarCell, SnapshotCalendarState, V2SnapshotCalendarComponent} from './v2-snapshot-calendar.component';

function dates(month = '2026-10'): (SnapshotCalendarCell | null)[] {
  return [null, null, null, ...Array.from({length: 31}, (_, i) => ({dateKey: `${month}-${String(i + 1).padStart(2, '0')}`,
    dayNumber: i + 1, optionId: [1, 3, 4, 10].includes(i + 1) ? `date-${month}-${i + 1}` : null,
    isAvailable: [1, 3, 4, 10].includes(i + 1), isSelected: i === 2, isToday: i === 3, ariaLabel: `October ${i + 1}, 2026`}))];
}
async function setup(state: SnapshotCalendarState = 'ready') {
  const opener = document.createElement('button'); opener.textContent = 'Ranking date'; document.body.append(opener); opener.focus();
  const fixture = TestBed.createComponent(V2SnapshotCalendarComponent);
  for (const [name, value] of Object.entries({state, days: dates(), month: 'October 2026', canPrevious: true, allowToday: true})) fixture.componentRef.setInput(name, value);
  const selected = vi.fn(), month = vi.fn(), today = vi.fn(), retry = vi.fn(), dismiss = vi.fn();
  fixture.componentInstance.dateSelected.subscribe(selected); fixture.componentInstance.monthChanged.subscribe(month);
  fixture.componentInstance.today.subscribe(today); fixture.componentInstance.retry.subscribe(retry); fixture.componentInstance.dismiss.subscribe(dismiss);
  fixture.detectChanges(); await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  return {fixture, element, opener, selected, month, today, retry, dismiss, dispose: () => {fixture.destroy(); opener.remove();}};
}
async function key(context: Awaited<ReturnType<typeof setup>>, date: string, key: string) {
  const button = context.element.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;
  button.focus(); button.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
  context.fixture.detectChanges(); await context.fixture.whenStable();
}

describe('Canonical responsive calendar interactions', () => {
  it('starts at the selected eligible date, traps focus and restores the opener on dismissal', async () => {
    const c = await setup();
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-03');
    expect(c.element.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(c.element.querySelectorAll('[role="row"]')).toHaveLength(5);
    expect(c.element.querySelectorAll('[role="gridcell"]')).toHaveLength(35);
    const close = [...c.element.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Close')!;
    close.focus(); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Previous saved month');
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
    expect(document.activeElement).toBe(close);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    expect(c.dismiss).toHaveBeenCalledOnce();
    c.fixture.destroy(); expect(document.activeElement).toBe(c.opener); c.opener.remove();
  });

  it('moves across eligible dates and week edges without selecting or requesting data', async () => {
    const c = await setup();
    await key(c, '2026-10-01', 'ArrowRight'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-03');
    await key(c, '2026-10-03', 'ArrowLeft'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-01');
    await key(c, '2026-10-03', 'ArrowDown'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-10');
    await key(c, '2026-10-10', 'ArrowUp'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-03');
    await key(c, '2026-10-03', 'Home'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-01');
    await key(c, '2026-10-01', 'End'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-04');
    await key(c, '2026-10-10', 'ArrowRight'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-10');
    await key(c, '2026-10-01', 'ArrowLeft'); expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-01');
    expect(c.selected).not.toHaveBeenCalled(); expect(c.month).not.toHaveBeenCalled();
    c.dispose();
  });

  it('navigates available months by PageUp and preserves the closest eligible day', async () => {
    const c = await setup();
    c.fixture.componentInstance.monthChanged.subscribe(() => c.fixture.componentRef.setInput('days', dates('2026-09')));
    await key(c, '2026-10-10', 'PageUp');
    expect(c.month.mock.calls[0][0]).toMatchObject({direction: -1, event: expect.any(KeyboardEvent)});
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-09-10');
    await key(c, '2026-09-10', 'PageDown');
    expect(c.month).toHaveBeenCalledOnce();
    expect(c.selected).not.toHaveBeenCalled();
    c.dispose();
  });

  it('revalidates current dates, permissions and Today after their rendered controls become stale', async () => {
    const c = await setup();
    const day = dates()[3]!;
    c.fixture.componentInstance.requestDate(day, new Event('click'));
    expect(c.selected.mock.calls[0][0]).toMatchObject({day: {dateKey: '2026-10-01', optionId: 'date-2026-10-1'}});
    c.fixture.componentRef.setInput('days', dates().map(d => d?.dateKey === day.dateKey ? {...d, isAvailable: false, optionId: null} : d));
    c.fixture.componentInstance.requestDate(day, new Event('click'));
    expect(c.selected).toHaveBeenCalledOnce();
    c.fixture.componentRef.setInput('allowToday', false);
    c.fixture.componentInstance.requestToday(new Event('click')); expect(c.today).not.toHaveBeenCalled();
    c.fixture.componentRef.setInput('enabled', false);
    c.fixture.componentInstance.requestDate(dates()[5]!, new Event('click'));
    c.fixture.componentInstance.requestMonth(-1, new Event('click'));
    c.fixture.componentRef.setInput('state', 'unavailable');
    c.fixture.componentInstance.requestRetry(new Event('click'));
    expect(c.selected).toHaveBeenCalledOnce(); expect(c.month).not.toHaveBeenCalled(); expect(c.retry).not.toHaveBeenCalled();
    c.dispose();
  });

  it.each(['refreshing', 'refresh-failed'] as const)('keeps cached dates and their focused cell through %s', async state => {
    const c = await setup();
    await key(c, '2026-10-03', 'ArrowRight');
    c.fixture.componentRef.setInput('state', state); c.fixture.componentRef.setInput('days', dates().map(d => d && {...d}));
    c.fixture.detectChanges(); await c.fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-04');
    expect(c.element.querySelectorAll('button.day')).toHaveLength(4);
    const buttons = [...c.element.querySelectorAll<HTMLButtonElement>('.calendar-footer button')];
    expect(buttons.map(b => b.textContent)).toEqual(state === 'refresh-failed' ? ['Retry', 'Today', 'Close'] : ['Today', 'Close']);
    if (state === 'refresh-failed') {buttons[0].click(); expect(c.retry).toHaveBeenCalledOnce();}
    else {c.fixture.componentInstance.requestRetry(new Event('click')); expect(c.retry).not.toHaveBeenCalled();}
    c.dispose();
  });

  it.each(['loading', 'empty', 'unavailable'] as const)('shows metadata %s without stale cached selection targets', async state => {
    const c = await setup(state);
    expect(c.element.querySelector('[role="grid"]')).toBeNull();
    expect(c.element.querySelectorAll('.control-skeleton')).toHaveLength(state === 'loading' ? 3 : 0);
    expect(c.element.textContent).toContain(state === 'loading' ? 'Loading saved dates…' : state === 'empty' ? 'No saved dates yet' : 'Saved dates unavailable');
    c.fixture.componentInstance.requestDate(dates()[3]!, new Event('click'));
    expect(c.selected).not.toHaveBeenCalled();
    const today = [...c.element.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Today')!;
    today.click(); expect(c.today).toHaveBeenCalledOnce();
    expect([...c.element.querySelectorAll('button')].at(-1)?.textContent).toBe('Close');
    c.dispose();
  });

  it('dismisses on the backdrop but keeps ordinary panel clicks inside', async () => {
    const c = await setup();
    c.element.querySelector<HTMLElement>('.calendar')!.click(); expect(c.dismiss).not.toHaveBeenCalled();
    c.element.querySelector<HTMLElement>('.calendar-overlay')!.click(); expect(c.dismiss).toHaveBeenCalledOnce();
    c.dispose();
  });

  it('keeps focus near the removed date when refreshed metadata removes the active cell', async () => {
    const c = await setup();
    await key(c, '2026-10-03', 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-10');
    c.fixture.componentRef.setInput('days', dates().map(d => d?.dayNumber === 10 ? {...d, isAvailable: false, optionId: null} : d));
    c.fixture.detectChanges(); await c.fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-04');
    expect(c.selected).not.toHaveBeenCalled();
    c.dispose();
  });

  it('leaves native activation keys alone and ignores stale keyboard events after permission loss', async () => {
    const c = await setup();
    for (const key of ['Enter', ' ', 'Tab']) {
      const event = new KeyboardEvent('keydown', {key, cancelable: true});
      c.fixture.componentInstance.onDayKey(event, dates()[5]!);
      expect(event.defaultPrevented).toBe(false);
    }
    const focused = document.activeElement;
    c.fixture.componentRef.setInput('enabled', false);
    const event = new KeyboardEvent('keydown', {key: 'PageUp', cancelable: true});
    c.fixture.componentInstance.onDayKey(event, dates()[5]!);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(focused);
    expect(c.month).not.toHaveBeenCalled(); expect(c.selected).not.toHaveBeenCalled();
    c.dispose();
  });

  it('keeps month browsing usable after current-month dates disappear, without activating the stale date', async () => {
    const c = await setup();
    c.fixture.componentRef.setInput('days', []);
    c.fixture.detectChanges(); await c.fixture.whenStable();
    expect(document.activeElement?.textContent).toBe('Close');
    const stale = new KeyboardEvent('keydown', {key: 'ArrowRight', cancelable: true});
    c.fixture.componentInstance.onDayKey(stale, dates()[5]!);
    expect(stale.defaultPrevented).toBe(false);
    c.element.querySelector<HTMLButtonElement>('[aria-label="Previous saved month"]')!.click();
    expect(c.month.mock.calls[0][0]).toMatchObject({direction: -1, event: expect.any(MouseEvent)});
    expect(c.selected).not.toHaveBeenCalled();
    c.dispose();
  });

  it('keeps keyboard focus in the dialog when Retry is replaced by initial loading', async () => {
    const c = await setup('unavailable');
    expect(document.activeElement?.textContent).toBe('Retry');
    c.fixture.componentInstance.retry.subscribe(() => c.fixture.componentRef.setInput('state', 'loading'));
    (document.activeElement as HTMLButtonElement).click();
    c.fixture.detectChanges(); await c.fixture.whenStable();
    expect(document.activeElement?.textContent).toBe('Close');
    expect(c.retry).toHaveBeenCalledOnce();
    expect(c.dismiss).not.toHaveBeenCalled();
    c.dispose();
  });

  it('keeps cached dates selectable and focus inside the dialog when a refresh Retry becomes busy', async () => {
    const c = await setup('refresh-failed');
    try {
      const retry = c.element.querySelector<HTMLButtonElement>('.retry')!;
      const datesBefore = [...c.element.querySelectorAll<HTMLButtonElement>('button.day')];
      retry.focus();
      c.fixture.componentInstance.retry.subscribe(() => c.fixture.componentRef.setInput('state', 'refreshing'));
      retry.click();
      c.fixture.componentInstance.requestRetry(new Event('click'));
      c.fixture.detectChanges(); await c.fixture.whenStable();
      expect(c.retry).toHaveBeenCalledOnce();
      expect(c.element.textContent).toContain('Refreshing saved dates…');
      expect(document.activeElement?.textContent).toBe('Close');
      expect(c.element.contains(document.activeElement)).toBe(true);
      const datesDuring = [...c.element.querySelectorAll<HTMLButtonElement>('button.day')];
      expect(datesDuring).toHaveLength(datesBefore.length);
      for (let i = 0; i < datesBefore.length; i++) expect(datesDuring[i]).toBe(datesBefore[i]);
      datesDuring[0].click();
      expect(c.selected).toHaveBeenCalledOnce();
      expect(c.selected.mock.calls[0][0].day.dateKey).toBe(datesDuring[0].dataset['date']);
      expect(c.dismiss).not.toHaveBeenCalled();
    } finally {c.dispose();}
  });

  it('keeps Close usable when permission is revoked while Retry has focus', async () => {
    const c = await setup('unavailable');
    expect(document.activeElement?.textContent).toBe('Retry');
    c.fixture.componentRef.setInput('enabled', false);
    (document.activeElement as HTMLButtonElement).click();
    c.fixture.detectChanges(); await c.fixture.whenStable();
    expect(c.retry).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe('Close');
    (document.activeElement as HTMLButtonElement).click();
    expect(c.dismiss).toHaveBeenCalledOnce();
    c.dispose();
  });

  it('wraps Tab to the active date when both month controls are disabled', async () => {
    const c = await setup();
    c.fixture.componentRef.setInput('canPrevious', false);
    c.fixture.detectChanges(); await c.fixture.whenStable();
    const close = [...c.element.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Close')!;
    close.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-03');
    c.dispose();
  });
});
