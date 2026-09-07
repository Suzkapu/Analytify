import { beforeEach, describe, expect, it } from "vitest";
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccessibleDialogDirective } from './accessible-dialog.directive';

@Component({
    template: `
    <button id="trigger" (click)="open = true">Open</button>
    <main id="page">Page content</main>
    @if (open) {
      <section appAccessibleDialog role="dialog" aria-modal="true"
        (modalEscape)="open = false">
        <button id="first">First</button>
        <button id="safe" appModalInitialFocus (click)="open = false">Cancel</button>
        <button id="last">Last</button>
      </section>
    }
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
class TestHostComponent {
    open = false;
}

describe('AccessibleDialogDirective', () => {
    beforeEach(() => {
        vi.useFakeTimers({ advanceTimeDelta: 1, shouldAdvanceTime: true });
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    let fixture: ComponentFixture<TestHostComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [TestHostComponent, AccessibleDialogDirective]
        }).compileComponents();
        fixture = TestBed.createComponent(TestHostComponent);
        fixture.detectChanges();
    });

    async function openDialog(): Promise<void> {
        (fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement).click();
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(0);
    }

    it('moves focus to the safe action and makes background content inert', async () => {
        await openDialog();

        expect((document.activeElement as HTMLElement).id).toBe('safe');
        expect((fixture.nativeElement.querySelector('#page') as HTMLElement).inert).toBe(true);
        expect(fixture.nativeElement.querySelector('#page').getAttribute('aria-hidden')).toBe('true');
    });

    it('wraps keyboard focus within the dialog', async () => {
        await openDialog();
        const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
        const last = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;

        last.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(first);

        first.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(last);
    });

    it('closes on Escape, restores the trigger, and releases the background', async () => {
        const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
        trigger.focus();
        await openDialog();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        fixture.detectChanges();

        expect(fixture.componentInstance.open).toBe(false);
        expect(document.activeElement).toBe(trigger);
        expect((fixture.nativeElement.querySelector('#page') as HTMLElement).inert).not.toBe(true);
        expect(fixture.nativeElement.querySelector('#page').hasAttribute('aria-hidden')).toBe(false);
    });
});
