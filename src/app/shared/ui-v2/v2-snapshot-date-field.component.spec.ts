import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2SnapshotDateFieldComponent} from './v2-snapshot-date-field.component';

describe('canonical snapshot date field', () => {
  it('exposes the purpose and selected date separately and emits one native activation without document dismissal', () => {
    const fixture = TestBed.createComponent(V2SnapshotDateFieldComponent);
    fixture.componentRef.setInput('label', 'Ranking date'); fixture.componentRef.setInput('value', 'Today');fixture.detectChanges();
    document.body.append(fixture.nativeElement);
    const open = vi.fn(), dismissed = vi.fn();fixture.componentInstance.open.subscribe(open);
    document.addEventListener('click', dismissed);
    try {
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Ranking date');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      const description = document.getElementById(button.getAttribute('aria-describedby')!);
      expect(description?.textContent).toBe('Today');
      button.click();expect(open).toHaveBeenCalledOnce();expect(open.mock.calls[0][0]).toBeInstanceOf(Event);
      expect(dismissed).not.toHaveBeenCalled();
      fixture.componentRef.setInput('expanded', true);fixture.componentRef.setInput('value', '3 Oct 2026');fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');expect(description?.textContent).toBe('3 Oct 2026');
    } finally {document.removeEventListener('click', dismissed);fixture.destroy();}
  });
});
