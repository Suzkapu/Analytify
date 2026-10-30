import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {AdminUserTaskEditorComponent} from './admin-user-task-editor.component';

async function mount(inputs: Record<string, unknown> = {}) {
  await TestBed.configureTestingModule({imports: [AdminUserTaskEditorComponent]}).compileComponents();
  const fixture = TestBed.createComponent(AdminUserTaskEditorComponent);
  fixture.componentRef.setInput('label', 'Listening history');
  fixture.componentRef.setInput('controlId', 'synthetic-history');
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const enabled = vi.fn(), intervalValue = vi.fn(), intervalUnit = vi.fn(), fridaysOnly = vi.fn();
  fixture.componentInstance.enabledChange.subscribe(enabled);
  fixture.componentInstance.intervalValueChange.subscribe(intervalValue);
  fixture.componentInstance.intervalUnitChange.subscribe(intervalUnit);
  fixture.componentInstance.fridaysOnlyChange.subscribe(fridaysOnly);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  const number = () => page.querySelector<HTMLInputElement>('input[type="number"]')!;
  const select = () => page.querySelector<HTMLSelectElement>('select')!;
  const toggle = (name = 'Enable optional Listening history') =>
    [...page.querySelectorAll<HTMLInputElement | HTMLButtonElement>('[role="switch"]')]
      .find(control => control.getAttribute('aria-label') === name)!;
  async function edit(control: HTMLInputElement | HTMLSelectElement, value: string) {
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', {bubbles: true}));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return {fixture, page, number, select, toggle, edit, enabled, intervalValue, intervalUnit, fridaysOnly};
}

describe('administration user task editor', () => {
  it('emits a numeric draft edit without changing the parent-owned interval, unit or optional choice', async () => {
    const {fixture, number, edit, intervalValue, intervalUnit, enabled, fridaysOnly} = await mount({intervalValue: 60});
    await edit(number(), '120');
    expect(intervalValue).toHaveBeenCalledExactlyOnceWith(120);
    expect(fixture.componentInstance.intervalValue).toBe(60);
    expect(fixture.componentInstance.intervalUnit).toBe('minutes');
    expect(fixture.componentInstance.enabled).toBe(false);
    expect(intervalUnit).not.toHaveBeenCalled();
    expect(enabled).not.toHaveBeenCalled();
    expect(fridaysOnly).not.toHaveBeenCalled();
  });

  it('preserves a cleared interval as null instead of silently turning it into zero or a default', async () => {
    const {number, edit, intervalValue} = await mount();
    await edit(number(), '');
    expect(intervalValue).toHaveBeenCalledExactlyOnceWith(null);
  });

  it.each(['minutes', 'hours', 'days'] as const)('offers and emits the selected %s unit without converting the draft number', async unit => {
    const {fixture, select, edit, intervalUnit, intervalValue} = await mount({intervalValue: 3});
    expect([...select().options].map(option => option.value)).toEqual(['minutes', 'hours', 'days']);
    await edit(select(), unit);
    expect(intervalUnit).toHaveBeenCalledExactlyOnceWith(unit);
    expect(fixture.componentInstance.intervalValue).toBe(3);
    expect(intervalValue).not.toHaveBeenCalled();
  });

  it('keeps the feature-required reason visible and read-only when optional work is toggled', async () => {
    const reason = 'Required by an active Song League.';
    const {fixture, page, toggle, enabled, intervalValue, intervalUnit} = await mount({requiredReason: reason});
    toggle().click();
    expect(enabled).toHaveBeenCalledExactlyOnceWith(true);
    expect(page.textContent).toContain(reason);
    expect(fixture.componentInstance.requiredReason).toBe(reason);
    expect(fixture.componentInstance.enabled).toBe(false);
    expect(page.querySelector('input[value="Required by an active Song League."]')).toBeNull();
    expect(intervalValue).not.toHaveBeenCalled();
    expect(intervalUnit).not.toHaveBeenCalled();
  });

  it('does not show an empty required reason or Friday option for an ordinary task', async () => {
    const {page, fridaysOnly} = await mount();
    expect(page.textContent).not.toContain('Only refresh on Fridays');
    expect(page.querySelector('[aria-label="Refresh Song League playlists only on Fridays"]')).toBeNull();
    expect(fridaysOnly).not.toHaveBeenCalled();
  });

  it.each([false, true])('shows the supplied Friday-only %s choice and emits its opposite independently', async checked => {
    const {fixture, toggle, fridaysOnly, enabled, intervalValue, intervalUnit} = await mount({label: 'Song League playlists', fridaysOnly: checked});
    const friday = toggle('Refresh Song League playlists only on Fridays');
    expect(friday).toBeTruthy();
    expect(friday instanceof HTMLInputElement ? friday.checked : friday.getAttribute('aria-checked') === 'true').toBe(checked);
    friday.click();
    expect(fridaysOnly).toHaveBeenCalledExactlyOnceWith(!checked);
    expect(fixture.componentInstance.fridaysOnly).toBe(checked);
    expect(enabled).not.toHaveBeenCalled();
    expect(intervalValue).not.toHaveBeenCalled();
    expect(intervalUnit).not.toHaveBeenCalled();
  });

  it('disables every control during parent-owned work and native activation emits nothing', async () => {
    const {page, enabled, intervalValue, intervalUnit, fridaysOnly} = await mount({busy: true, fridaysOnly: true});
    const controls = [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button')];
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const control of controls) {
      expect(control.disabled).toBe(true);
      control.click();
    }
    for (const output of [enabled, intervalValue, intervalUnit, fridaysOnly]) expect(output).not.toHaveBeenCalled();
  });

  it('associates visible field labels and task-specific accessible names with their controls', async () => {
    const {page, number, select, toggle} = await mount();
    expect(number().getAttribute('aria-label')).toBe('Listening history interval');
    expect(select().getAttribute('aria-label')).toBe('Listening history interval unit');
    expect(toggle()).toBeTruthy();
    for (const [control, text] of [[number(), 'Optional interval'], [select(), 'Unit']] as const) {
      expect([...page.querySelectorAll('label')].filter(label => label.control === control).map(label => label.textContent?.trim())).toContain(text);
    }
  });

  it('renders supplied task and required-reason strings as literal text', async () => {
    const label = '<img src=x onerror=alert(1)>', reason = '<script>unsafe()</script>';
    const {page} = await mount({label, requiredReason: reason});
    expect(page.textContent).toContain(label);
    expect(page.textContent).toContain(reason);
    expect(page.querySelector('script, img[onerror]')).toBeNull();
  });

  it('keeps labels unique and addressed correctly when two task editors share the page', async () => {
    @Component({standalone: true, imports: [AdminUserTaskEditorComponent], template: `
      <v2-admin-user-task-editor label="Listening history" controlId="alice-history" />
      <v2-admin-user-task-editor label="Short-term stats" controlId="alice-short" />
    `})
    class TwoTasks {}
    await TestBed.configureTestingModule({imports: [TwoTasks]}).compileComponents();
    const fixture = TestBed.createComponent(TwoTasks);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const fields = [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[type="number"],select')];
    expect(fields).toHaveLength(4);
    expect(new Set(fields.map(field => field.id)).size).toBe(4);
    for (const field of fields) {
      expect(field.id).not.toBe('');
      expect([...page.querySelectorAll('label')].some(label => label.control === field)).toBe(true);
    }
    expect(fields.map(field => field.getAttribute('aria-label'))).toEqual([
      'Listening history interval', 'Listening history interval unit', 'Short-term stats interval', 'Short-term stats interval unit'
    ]);
  });
});
