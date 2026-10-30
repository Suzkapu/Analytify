import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {V2StatusFeedbackComponent} from './v2-status-feedback.component';

describe('shared polite status feedback', () => {
  it('renders untrusted heading and message as literal text without creating markup or actions', async () => {
    await TestBed.configureTestingModule({imports: [V2StatusFeedbackComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2StatusFeedbackComponent);
    const heading = '<img src=x onerror="alert(1)">';
    const message = '<button>Do not execute</button>';
    fixture.componentRef.setInput('heading', heading); fixture.componentRef.setInput('message', message);
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain(heading); expect(status.textContent).toContain(message);
    expect(status.querySelector('img, button, script')).toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.hasAttribute('aria-busy')).toBe(false);
  });

  it('announces new content and busy completion in the same status region', async () => {
    await TestBed.configureTestingModule({imports: [V2StatusFeedbackComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2StatusFeedbackComponent);
    fixture.componentRef.setInput('heading', 'Loading'); fixture.componentRef.setInput('message', 'Please wait');
    fixture.componentRef.setInput('busy', true); fixture.detectChanges();
    const status = fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    expect(status.getAttribute('aria-busy')).toBe('true');
    fixture.componentRef.setInput('heading', 'Loaded'); fixture.componentRef.setInput('message', 'Current data');
    fixture.componentRef.setInput('busy', false); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent).toContain('Loaded'); expect(status.textContent).not.toContain('Please wait');
    expect(status.hasAttribute('aria-busy')).toBe(false);
  });
});
