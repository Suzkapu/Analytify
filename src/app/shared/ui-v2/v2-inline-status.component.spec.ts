import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {V2InlineStatusComponent} from './v2-inline-status.component';
describe('inline status feedback', () => {
  it('announces the supplied state, busy state and error without adding actions or imagery', () => {
    const fixture = TestBed.createComponent(V2InlineStatusComponent);
    fixture.componentRef.setInput('title', 'Checking schedules'); fixture.componentRef.setInput('description', 'Saved schedules remain visible.');
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('section') as HTMLElement;
    expect(section.getAttribute('role')).toBe('status'); expect(section.getAttribute('aria-busy')).toBe('true');
    expect(section.textContent).toContain('Saved schedules remain visible.'); expect(section.querySelector('button,img')).toBeNull();
    fixture.componentRef.setInput('error', true); fixture.componentRef.setInput('busy', false); fixture.detectChanges();
    expect(section.getAttribute('role')).toBe('alert'); expect(section.getAttribute('aria-busy')).toBe('false');
  });
});
