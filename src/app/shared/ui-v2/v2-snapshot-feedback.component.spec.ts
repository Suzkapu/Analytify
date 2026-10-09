import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2SnapshotFeedbackComponent} from './v2-snapshot-feedback.component';

function setup(target: 'ranking' | 'comparison', state: 'loading' | 'empty' | 'unavailable') {
  const fixture = TestBed.createComponent(V2SnapshotFeedbackComponent);
  fixture.componentRef.setInput('target', target);
  fixture.componentRef.setInput('state', state);
  const retry = vi.fn(), choose = vi.fn();
  fixture.componentInstance.retry.subscribe(retry);
  fixture.componentInstance.chooseDate.subscribe(choose);
  fixture.detectChanges();
  return {fixture, element: fixture.nativeElement as HTMLElement, retry, choose};
}

describe('Canonical saved-date service feedback', () => {
  it.each(['ranking', 'comparison'] as const)('announces pending %s without recovery actions or duplicate requests', target => {
    const {fixture, element, retry, choose} = setup(target, 'loading');
    expect(element.querySelector('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
    expect(element.textContent).toContain(target === 'ranking' ? 'Loading saved rankings…' : 'Loading comparison rankings… Your selected rankings stay visible.');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('assets/design-v2/history-progress.svg');
    expect(element.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(element.querySelectorAll('.skeleton-row')).toHaveLength(target === 'ranking' ? 3 : 0);
    if (target === 'ranking') expect(element.querySelector('.skeletons')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('button')).toBeNull();
    fixture.componentInstance.requestRetry(); fixture.componentInstance.requestChooseDate();
    expect(retry).not.toHaveBeenCalled(); expect(choose).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it.each(['ranking', 'comparison'] as const)('offers date recovery for successfully empty %s without treating it as a failure', target => {
    const {fixture, element, retry, choose} = setup(target, 'empty');
    expect(element.querySelector('[role="status"]')).not.toBeNull();
    expect(element.querySelector('[role="alert"], [aria-busy], .unavailable')).toBeNull();
    expect(element.textContent).toContain(target === 'ranking' ? 'No rankings for this category' : 'No comparison rankings');
    expect(element.textContent).toContain(target === 'ranking' ? 'Try another category, date or ranking period.' : 'Your selected rankings stay visible. Choose another date to compare.');
    expect([...element.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Choose date']);
    element.querySelector<HTMLButtonElement>('button')!.click();
    expect(choose).toHaveBeenCalledOnce();
    fixture.componentInstance.requestRetry(); expect(retry).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it.each(['ranking', 'comparison'] as const)('offers explicit %s retry then date recovery and drops stale actions while pending', target => {
    const {fixture, element, retry, choose} = setup(target, 'unavailable');
    expect(element.querySelector('[role="alert"]')?.getAttribute('aria-live')).toBe('assertive');
    expect(element.textContent).toContain(target === 'ranking' ? 'Saved rankings unavailable' : 'Comparison unavailable');
    const buttons = [...element.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map(b => b.textContent?.trim())).toEqual(['Retry', 'Choose date']);
    buttons[1].click(); expect(choose).toHaveBeenCalledOnce(); expect(retry).not.toHaveBeenCalled();
    fixture.componentInstance.retry.subscribe(() => fixture.componentRef.setInput('state', 'loading'));
    buttons[0].click(); buttons[0].click(); buttons[1].click();
    expect(retry).toHaveBeenCalledOnce(); expect(choose).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"], button')).toBeNull();
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    fixture.componentRef.setInput('state', 'empty'); fixture.detectChanges();
    expect(element.textContent).not.toContain('unavailable');
    expect(element.querySelectorAll('button')).toHaveLength(1);
    fixture.destroy();
  });

  it('removes private recovery immediately after permission loss and guards captured handlers', () => {
    const {fixture, element, retry, choose} = setup('ranking', 'unavailable');
    fixture.componentRef.setInput('privateActions', false);
    fixture.componentInstance.requestRetry(); fixture.componentInstance.requestChooseDate();
    fixture.detectChanges();
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).toContain('Saved rankings unavailable');
    expect(retry).not.toHaveBeenCalled(); expect(choose).not.toHaveBeenCalled();
    fixture.componentRef.setInput('target', 'comparison'); fixture.detectChanges();
    expect(element.textContent).toContain('Comparison unavailable');
    expect(element.textContent).not.toContain('this saved date');
    fixture.destroy();
  });
});

