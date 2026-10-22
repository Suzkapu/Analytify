import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2ShortcutChoiceComponent} from './v2-shortcut-choice.component';

function createChoice() {
  const fixture = TestBed.createComponent(V2ShortcutChoiceComponent);
  fixture.componentRef.setInput('label', 'Friends'); fixture.componentRef.setInput('icon', 'pi-user');
  fixture.detectChanges();
  return {fixture, button: fixture.nativeElement.querySelector('button') as HTMLButtonElement};
}

describe('Canonical shortcut selection action', () => {
  it('exposes a named pressed state owned by the confirmed selection', () => {
    const {fixture, button} = createChoice();
    expect(button.textContent?.trim()).toBe('Friends');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('i')?.getAttribute('aria-hidden')).toBe('true');
    fixture.componentRef.setInput('selected', true); fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
  it('rejects a stale dispatched click while disabled and emits an intent after re-enabling', () => {
    const {fixture, button} = createChoice(); const requested = vi.fn();
    fixture.componentInstance.changeRequested.subscribe(requested);
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    expect(button.disabled).toBe(true);
    button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    expect(requested).not.toHaveBeenCalled();
    fixture.componentRef.setInput('disabled', false); fixture.detectChanges(); button.click();
    expect(requested).toHaveBeenCalledOnce();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
