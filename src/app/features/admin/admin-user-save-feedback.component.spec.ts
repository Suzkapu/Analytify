import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {AdminUserSaveFeedbackComponent} from './admin-user-save-feedback.component';
import {AdminUserRefreshActionComponent} from './admin-user-refresh-action.component';

const states = [
  ['validation', 'Check schedule intervals', 'Your draft is kept; nothing was saved.', false],
  ['saving', 'Saving settings…', 'Later edits are not submitted.', true],
  ['refreshing', 'Refreshing user settings…', 'The save has already succeeded.', true],
  ['saved', 'Settings saved', 'Saved values were refreshed from the server.', false],
  ['newer-draft', 'Settings saved · Unsaved changes', 'Save again to submit them.', false],
  ['save-error', 'Settings could not be saved', 'Your draft is kept.', false],
  ['read-error', 'Settings saved · Refresh needed', 'Refresh user settings without saving again.', false]
] as const;

describe('canonical user schedule save feedback', () => {
  it.each(states)('announces %s locally without duplicate controls', async (state, heading, body, busy) => {
    await TestBed.configureTestingModule({imports: [AdminUserSaveFeedbackComponent]}).compileComponents();
    const fixture = TestBed.createComponent(AdminUserSaveFeedbackComponent);
    fixture.componentRef.setInput('state', state); fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-busy') === 'true').toBe(busy);
    expect(status.querySelector('h3')!.textContent).toBe(heading);
    expect(status.textContent).toContain(body);
    expect(status.querySelector('button, a, input, [role="button"], [tabindex]')).toBeNull();
  });

  it('replaces stale saving/error feedback through read-only recovery and newer-draft success', async () => {
    await TestBed.configureTestingModule({imports: [AdminUserSaveFeedbackComponent]}).compileComponents();
    const fixture = TestBed.createComponent(AdminUserSaveFeedbackComponent);
    for (const [state, heading] of states) {
      fixture.componentRef.setInput('state', state); fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(fixture.nativeElement.querySelector('h3').textContent).toBe(heading);
    }
  });
});

describe('read-only user settings recovery action', () => {
  it('emits one explicit recovery request and retains its exact accessible text', async () => {
    await TestBed.configureTestingModule({imports: [AdminUserRefreshActionComponent]}).compileComponents();
    const fixture = TestBed.createComponent(AdminUserRefreshActionComponent);
    let requests = 0; fixture.componentInstance.refresh.subscribe(() => requests++);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Refresh user settings');
    expect(button.type).toBe('button');
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
    button.click(); expect(requests).toBe(1);
  });

  it('prevents repeated recovery while busy, then permits an explicit retry', async () => {
    await TestBed.configureTestingModule({imports: [AdminUserRefreshActionComponent]}).compileComponents();
    const fixture = TestBed.createComponent(AdminUserRefreshActionComponent);
    let requests = 0; fixture.componentInstance.refresh.subscribe(() => requests++);
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click(); expect(requests).toBe(0);
    fixture.componentRef.setInput('busy', false); fixture.detectChanges();
    button.click(); expect(requests).toBe(1);
  });
});
