import { beforeEach, describe, expect, it } from "vitest";
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccessibleDialogDirective } from './accessible-dialog.directive';

@Component({
    template: `
    <button id="trigger" (click)="open = true">Open</button>
    <main id="page" tabindex="-1">Page content</main>
    @if (open) {
      <section appAccessibleDialog [modalFocusReturnFallback]="focusFallback" [modalFocusReturnTarget]="focusTarget" role="dialog" aria-modal="true"
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
    focusFallback: HTMLElement | null = null;
    focusTarget: HTMLElement | null = null;
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
            declarations: [TestHostComponent],
            imports: [AccessibleDialogDirective]
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

    it('preserves a control chosen before deferred initial focus runs', async () => {
        (fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement).click();
        fixture.detectChanges();
        const chosen = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;
        chosen.focus();

        await vi.advanceTimersByTimeAsync(0);

        expect(document.activeElement).toBe(chosen);
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

    it('respects dynamically removed tab stops without hiding their controls', async () => {
        await openDialog();
        const first = fixture.nativeElement.querySelector('#first') as HTMLButtonElement;
        const safe = fixture.nativeElement.querySelector('#safe') as HTMLButtonElement;
        const last = fixture.nativeElement.querySelector('#last') as HTMLButtonElement;
        first.tabIndex = -1;
        last.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
        expect(document.activeElement).toBe(safe);
        expect(first.disabled).toBe(false);
        expect(first.getAttribute('aria-hidden')).toBeNull();
        safe.tabIndex = -1;
        last.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
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
    it('returns focus to the inventory when deletion removes the original trigger', async () => {
        const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
        const inventory = fixture.nativeElement.querySelector('#page') as HTMLElement;
        fixture.componentInstance.focusFallback = inventory;
        trigger.focus(); await openDialog();
        trigger.remove();
        (fixture.nativeElement.querySelector('#safe') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(inventory.inert).not.toBe(true);
        expect(document.activeElement).toBe(inventory);
    });

    it('prefers the original connected trigger over the fallback after cancellation', async () => {
        const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
        fixture.componentInstance.focusFallback = fixture.nativeElement.querySelector('#page');
        trigger.focus(); await openDialog();
        (fixture.nativeElement.querySelector('#safe') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(document.activeElement).toBe(trigger);
    });

    it('does not move focus to a disconnected fallback after navigation removes the old view', async () => {
        const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
        const inventory = fixture.nativeElement.querySelector('#page') as HTMLElement;
        fixture.componentInstance.focusFallback = inventory;
        trigger.focus(); await openDialog(); trigger.remove(); inventory.remove();
        const destination = document.createElement('button'); document.body.append(destination); destination.focus();
        (fixture.nativeElement.querySelector('#safe') as HTMLButtonElement).click(); fixture.detectChanges();
        expect(document.activeElement).toBe(destination); destination.remove();
    });

    it('restores an explicit opener after its busy disabled state clears in the closing render', async () => {
        const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
        const inventory = fixture.nativeElement.querySelector('#page') as HTMLElement;
        fixture.componentInstance.focusTarget = trigger;
        fixture.componentInstance.focusFallback = inventory;
        trigger.disabled = true; inventory.focus();
        fixture.componentInstance.open = true; fixture.detectChanges(); await vi.advanceTimersByTimeAsync(0);
        (fixture.nativeElement.querySelector('#safe') as HTMLButtonElement).click(); fixture.detectChanges();
        trigger.disabled = false;
        await vi.advanceTimersByTimeAsync(0);
        expect(document.activeElement).toBe(trigger);
    });

});
