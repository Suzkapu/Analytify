import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2SearchPastToggleComponent} from './v2-search-past-toggle.component';

function setup(checked = false) {
  const fixture = TestBed.createComponent(V2SearchPastToggleComponent);
  fixture.componentRef.setInput('label', 'Search past rankings');
  fixture.componentRef.setInput('checked', checked);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  const emitted = vi.fn(); fixture.componentInstance.checkedChange.subscribe(emitted);
  return {fixture, button, emitted};
}

describe('controlled historical-search toggle', () => {
  it('exposes its name and checked state and requests changes without changing consumer-owned state', () => {
    const {fixture, button, emitted} = setup();
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.textContent?.trim()).toBe('Search past rankings');
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
    button.click(); expect(emitted).toHaveBeenLastCalledWith(true);
    expect(button.getAttribute('aria-checked')).toBe('false');
    fixture.componentRef.setInput('checked', true); fixture.detectChanges();
    expect(button.getAttribute('aria-checked')).toBe('true');
    button.click(); expect(emitted.mock.calls).toEqual([[true], [false]]);
    fixture.destroy();
  });

  it.each([false, true])('preserves checked=%s while disabled, associates the consumer reason and rejects dispatched clicks', checked => {
    const {fixture, button, emitted} = setup(checked);
    const reason = document.createElement('p');
    reason.id = 'history-unavailable-reason';
    reason.textContent = 'Choose Today to search past rankings.';
    document.body.appendChild(reason);
    try {
    fixture.componentRef.setInput('disabledReasonId', 'history-unavailable-reason');
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe(String(checked));
    expect(button.getAttribute('aria-describedby')).toBe('history-unavailable-reason');
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe(reason.textContent);
    button.click(); button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(emitted).not.toHaveBeenCalled();
    } finally {reason.remove(); fixture.destroy();}
  });

  it('restores interaction after eligibility changes and removes stale disabled reason association', () => {
    const {fixture, button, emitted} = setup(true);
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('disabledReasonId', 'reason'); fixture.detectChanges();
    fixture.componentRef.setInput('disabled', false); fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    button.click(); expect(emitted).toHaveBeenCalledExactlyOnceWith(false);
    fixture.destroy();
  });
});
