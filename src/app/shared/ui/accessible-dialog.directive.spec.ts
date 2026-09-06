import {Component} from '@angular/core';
import {ComponentFixture, TestBed, fakeAsync, tick} from '@angular/core/testing';
import {AccessibleDialogDirective} from './accessible-dialog.directive';

@Component({
  template: `
    <button id="trigger" (click)="open = true">Open</button>
    <main id="page">Page content</main>
    <section *ngIf="open" appAccessibleDialog role="dialog" aria-modal="true"
      (modalEscape)="open = false">
      <button id="first">First</button>
      <button id="safe" appModalInitialFocus (click)="open = false">Cancel</button>
      <button id="last">Last</button>
    </section>
  `
})
class TestHostComponent {
  open = false;
}

describe('AccessibleDialogDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent, AccessibleDialogDirective]
    }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  function openDialog(): void {
    (fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
  }

  it('moves focus to the safe action and makes background content inert', fakeAsync(() => {
    openDialog();

    expect((document.activeElement as HTMLElement).id).toBe('safe');
    expect((fixture.nativeElement.querySelector('#page') as HTMLElement).inert).toBeTrue();
    expect(fixture.nativeElement.querySelector('#page').getAttribute('aria-hidden')).toBe('true');
  }));

  it('wraps keyboard focus within the dialog', fakeAsync(() => {
    openDialog();
    const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
    const last = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
    expect(document.activeElement).toBe(last);
  }));

  it('closes on Escape, restores the trigger, and releases the background', fakeAsync(() => {
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
    trigger.focus();
    openDialog();

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    fixture.detectChanges();

    expect(fixture.componentInstance.open).toBeFalse();
    expect(document.activeElement).toBe(trigger);
    expect((fixture.nativeElement.querySelector('#page') as HTMLElement).inert).toBeFalse();
    expect(fixture.nativeElement.querySelector('#page').hasAttribute('aria-hidden')).toBeFalse();
  }));
});
