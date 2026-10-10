import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2IntervalPopupComponent} from './v2-interval-popup.component';
function setup() {
  const f = TestBed.createComponent(V2IntervalPopupComponent);
  f.componentRef.setInput('mode', 'value'); f.componentRef.setInput('value', 24); f.componentRef.setInput('minimum', 2);
  f.componentRef.setInput('maximum', 168); f.componentRef.setInput('unit', 'hours'); f.detectChanges();
  const chosen = vi.fn(); f.componentInstance.valueChosen.subscribe(chosen); return {f, state: f.componentInstance, chosen};
}
describe('draft-only interval popup', () => {
  it.each([null, 1.5, 1, 169])('keeps invalid %s input open with readable feedback and no draft effect', value => {
    const {state, chosen, f} = setup(); state.pending.set(value); state.apply(); f.detectChanges();
    expect(chosen).not.toHaveBeenCalled(); expect((f.nativeElement.querySelector('[role="alert"]') as HTMLElement).textContent).not.toBe('');
    expect(f.nativeElement.querySelector('input').getAttribute('aria-invalid')).toBe('true');
  });
  it('applies the whole-number upper boundary and resets local input when reopened with another value', () => {
    const {state, chosen, f} = setup(); state.pending.set(168); state.apply(); expect(chosen).toHaveBeenCalledWith(168);
    f.componentRef.setInput('value', 48); f.detectChanges(); expect(state.pending()).toBe(48); expect(state.error()).toBe('');
  });
  it('chooses every supported unit without numeric conversion and keeps Cancel last', () => {
    const {f, state} = setup(); f.componentRef.setInput('mode', 'unit'); f.detectChanges();
    const units = vi.fn(); const cancelled = vi.fn(); state.unitChosen.subscribe(units); state.cancelled.subscribe(cancelled);
    const buttons = [...f.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.map(b => b.textContent?.trim())).toEqual(['minutes', 'hours', 'days', 'Cancel']);
    for (const button of buttons) button.click();
    expect(units.mock.calls).toEqual([['minutes'], ['hours'], ['days']]); expect(cancelled).toHaveBeenCalledOnce();
  });
  it('cancels through Escape and backdrop without applying pending input', () => {
    const {f, state, chosen} = setup(); const cancelled = vi.fn(); state.cancelled.subscribe(cancelled); state.pending.set(48);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    f.nativeElement.querySelector('.v2-interval-backdrop').click(); expect(cancelled).toHaveBeenCalledTimes(2); expect(chosen).not.toHaveBeenCalled();
  });
});
