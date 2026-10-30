import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {AdminRunFeedbackComponent} from './admin-run-feedback.component';

const states = [
  ['loading', 'Loading recent runs…', 'Synchronization audit records will appear here.', true],
  ['refreshing', 'Refreshing recent runs…', 'Current audit records stay visible while we check for updates.', true],
  ['empty', 'No jobs have been queued yet.', 'Scheduled and manually requested runs will appear here.', false],
  ['load-error', 'Recent runs could not be loaded', 'Use Refresh recent runs to try again. No audit action is available on individual records.', false],
  ['refresh-error', 'Recent runs could not be refreshed', 'Current audit records are kept. Use Refresh recent runs to try again.', false]
] as const;

describe('administration recent-run feedback', () => {
  for (const [state, title, description, busy] of states) {
    it(`announces ${state} without adding audit actions or duplicate recovery controls`, async () => {
      await TestBed.configureTestingModule({imports: [AdminRunFeedbackComponent]}).compileComponents();
      const fixture = TestBed.createComponent(AdminRunFeedbackComponent);
      fixture.componentRef.setInput('state', state);
      fixture.detectChanges();
      const page = fixture.nativeElement as HTMLElement;
      const status = page.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(status!.getAttribute('aria-live')).toBe('polite');
      expect(status!.textContent).toContain(title);
      expect(status!.textContent).toContain(description);
      expect(status!.getAttribute('aria-busy') === 'true').toBe(busy);
      expect(page.querySelector('button, a, input, select, textarea, [role="button"], [tabindex]')).toBeNull();
      expect(page.querySelector('[role="alert"]')).toBeNull();
    });
  }

  it('replaces obsolete loading and error announcements as the run inventory recovers', async () => {
    await TestBed.configureTestingModule({imports: [AdminRunFeedbackComponent]}).compileComponents();
    const fixture = TestBed.createComponent(AdminRunFeedbackComponent);
    const page = fixture.nativeElement as HTMLElement;
    for (const [state, title, description, busy] of states) {
      fixture.componentRef.setInput('state', state);
      fixture.detectChanges();
      expect(page.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(page.textContent).toContain(title);
      expect(page.textContent).toContain(description);
      expect(page.querySelector('[aria-busy="true"]') !== null).toBe(busy);
      for (const [otherState, otherTitle] of states) {
        if (otherState !== state) expect(page.textContent).not.toContain(otherTitle);
      }
    }
    fixture.componentRef.setInput('state', 'empty');
    fixture.detectChanges();
    expect(page.textContent).toContain('No jobs have been queued yet.');
    expect(page.textContent).not.toContain('could not');
    expect(page.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
