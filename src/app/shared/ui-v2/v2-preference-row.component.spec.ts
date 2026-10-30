import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2PreferenceRowComponent} from './v2-preference-row.component';

describe('canonical preference row', () => {
  function setup(checked = false) {
    const fixture = TestBed.createComponent(V2PreferenceRowComponent);
    fixture.componentRef.setInput('label', 'Stats requests'); fixture.componentRef.setInput('description', 'Notify me');
    fixture.componentRef.setInput('iconUrl', 'assets/design-v2/settings-stats.svg'); fixture.componentRef.setInput('checked', checked);
    fixture.detectChanges();
    return {fixture, input: fixture.nativeElement.querySelector('input') as HTMLInputElement};
  }
  it.each([false, true])('requests a change while keeping the saved %s value until confirmation', checked => {
    const {fixture, input} = setup(checked); const changed = vi.fn(); fixture.componentInstance.checkedChange.subscribe(changed);
    input.click(); expect(changed).toHaveBeenCalledWith(!checked); expect(input.checked).toBe(checked);
    fixture.componentRef.setInput('checked', !checked); fixture.detectChanges(); expect(input.checked).toBe(!checked);
    expect(fixture.nativeElement.querySelector('.v2-preference-row__switch img').getAttribute('src')).toContain(!checked ? 'switch-on.svg' : 'switch-off.svg');
    expect(input.getAttribute('aria-label')).toBe('Stats requests'); expect(input.getAttribute('role')).toBe('switch');
  });
  it('blocks native and synthetic changes while disabled', () => {
    const {fixture, input} = setup(); const changed = vi.fn(); fixture.componentInstance.checkedChange.subscribe(changed);
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges(); input.click();
    input.checked = true; input.dispatchEvent(new Event('change'));
    expect(input.checked).toBe(false); expect(changed).not.toHaveBeenCalled(); expect(input.disabled).toBe(true);
  });
  it('supports an unadorned task switch with a distinct accessible purpose', () => {
    const {fixture, input} = setup();
    fixture.componentRef.setInput('compact', true);
    fixture.componentRef.setInput('description', '');
    fixture.componentRef.setInput('ariaLabel', 'Enable optional stats requests');
    fixture.detectChanges();
    expect(input.getAttribute('aria-label')).toBe('Enable optional stats requests');
    expect(fixture.nativeElement.querySelector('.v2-preference-row > img')).toBeNull();
    expect(fixture.nativeElement.querySelector('small')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Stats requests');
  });

});
