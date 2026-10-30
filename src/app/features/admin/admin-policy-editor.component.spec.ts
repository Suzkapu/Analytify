import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {SyncSchedulePolicy} from '@core/admin/admin.models';
import {AdminPolicyEditorComponent} from './admin-policy-editor.component';

async function mount(overrides: Partial<SyncSchedulePolicy> = {}, inputs: Record<string, unknown> = {}) {
  await TestBed.configureTestingModule({imports: [AdminPolicyEditorComponent]}).compileComponents();
  const fixture = TestBed.createComponent(AdminPolicyEditorComponent);
  const policy: SyncSchedulePolicy = {taskKey: 'listening_history', available: true, intervalValue: 60, intervalUnit: 'minutes', ...overrides};
  fixture.componentRef.setInput('policy', policy);
  fixture.componentRef.setInput('label', 'Listening history');
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  const save = vi.fn();
  const refresh = vi.fn();
  fixture.componentInstance.save.subscribe(save);
  fixture.componentInstance.refresh.subscribe(refresh);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  const button = (name: string) => [...page.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!;
  const interval = () => page.querySelector<HTMLInputElement>('input[type="number"]')!;
  const unit = () => page.querySelector<HTMLSelectElement>('select')!;
  async function edit(element: HTMLInputElement | HTMLSelectElement, value: string) {
    element.value = value;
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {bubbles: true}));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return {fixture, page, policy, save, refresh, button, interval, unit, edit};
}

describe('administration policy editor', () => {
  it('submits the addressed policy with the exact selected number and unit', async () => {
    const {interval, unit, edit, button, save, policy} = await mount();
    await edit(interval(), '3');
    await edit(unit(), 'days');
    button('Save').click();
    expect(save).toHaveBeenCalledExactlyOnceWith({...policy, intervalValue: 3, intervalUnit: 'days'});
  });

  it('labels the interval and unit controls for assistive technology', async () => {
    const {page, interval, unit} = await mount();
    for (const [control, text] of [[interval(), 'Minimum interval'], [unit(), 'Unit']] as const) {
      const labels = [...page.querySelectorAll('label')].filter(label => label.control === control);
      expect(labels.map(label => label.textContent?.trim())).toContain(text);
    }
  });

  it('allows listening-history availability to be changed with the saved policy', async () => {
    const {page, button, save, policy, fixture} = await mount();
    const checkbox = page.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox).not.toBeNull();
    expect(page.textContent).toContain('Available to users');
    checkbox.click();
    fixture.detectChanges();
    await fixture.whenStable();
    button('Save').click();
    expect(save).toHaveBeenCalledExactlyOnceWith({...policy, available: false});
  });

  it('does not offer availability changes for retained statistics tasks', async () => {
    const {page, button, save, policy} = await mount({taskKey: 'stats_short_term', available: true});
    expect(page.querySelector('input[type="checkbox"], [role="switch"]')).toBeNull();
    expect(page.textContent).not.toContain('Available to users');
    button('Save').click();
    expect(save).toHaveBeenCalledExactlyOnceWith(policy);
  });

  it('disables every interactive control while saving and cannot submit twice', async () => {
    const {page, save, refresh, button} = await mount({}, {busy: true, refreshRequired: true});
    const controls = [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')];
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const control of controls) expect(control.disabled).toBe(true);
    button('Saving…').click();
    page.querySelectorAll<HTMLButtonElement>('button').forEach(control => control.click());
    expect(save).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('announces row feedback and offers a refresh without retrying a write', async () => {
    const {page, button, refresh, save, policy} = await mount({}, {
      message: 'Policy changed elsewhere. Refresh before saving.', refreshRequired: true
    });
    const feedback = page.querySelector('[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]');
    expect(feedback?.textContent).toContain('Policy changed elsewhere. Refresh before saving.');
    button('Refresh policy').click();
    expect(refresh).toHaveBeenCalledExactlyOnceWith(policy);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([['minutes', '10080'], ['hours', '168'], ['days', '7']] as const)(
    'constrains the interval to the seven-day boundary in %s', async (selectedUnit, maximum) => {
      const {interval, unit, edit} = await mount();
      await edit(unit(), selectedUnit);
      expect(interval().min).toBe('1');
      expect(interval().max).toBe(maximum);
      await edit(interval(), String(Number(maximum) + 1));
      expect(interval().validity.rangeOverflow).toBe(true);
    }
  );
});
