import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output
} from '@angular/core';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

interface InertState {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

/** Supplies focus containment and background isolation for the app's custom modal surfaces. */
@Directive({
    selector: '[appAccessibleDialog]',
    standalone: false
})
export class AccessibleDialogDirective implements AfterViewInit, OnDestroy {
  @Input() modalEscapeDisabled = false;
  @Output() modalEscape = new EventEmitter<void>();

  private readonly dialog: HTMLElement;
  private readonly previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  private readonly inertStates: InertState[] = [];
  private focusTimer?: ReturnType<typeof setTimeout>;

  constructor(elementRef: ElementRef<HTMLElement>) {
    this.dialog = elementRef.nativeElement;
  }

  ngAfterViewInit(): void {
    this.dialog.tabIndex = this.dialog.hasAttribute('tabindex') ? this.dialog.tabIndex : -1;
    this.isolateBackground();
    this.focusTimer = setTimeout(() => this.focusInitialControl());
  }

  ngOnDestroy(): void {
    if (this.focusTimer) clearTimeout(this.focusTimer);
    for (const state of this.inertStates.reverse()) {
      state.element.inert = state.inert;
      if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
      else state.element.setAttribute('aria-hidden', state.ariaHidden);
    }
    if (this.previouslyFocused?.isConnected && !this.previouslyFocused.closest('[inert]')) {
      this.previouslyFocused.focus();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!this.modalEscapeDisabled) this.modalEscape.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      this.dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusInitialControl(): void {
    const requested = this.dialog.querySelector<HTMLElement>('[appModalInitialFocus]:not([disabled])');
    (requested ?? this.focusableElements()[0] ?? this.dialog).focus();
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(element => element.getAttribute('aria-hidden') !== 'true');
  }

  private isolateBackground(): void {
    let branch: HTMLElement = this.dialog;
    while (branch.parentElement && branch.parentElement !== document.body) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.contains(this.dialog)) continue;
        this.inertStates.push({
          element: sibling,
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute('aria-hidden')
        });
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = parent;
    }
  }
}
