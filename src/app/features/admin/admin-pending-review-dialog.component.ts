import {DatePipe} from '@angular/common';
import {afterEveryRender, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output, viewChild} from '@angular/core';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';
import {AdminPendingReviewView} from './admin-pending-review-state';
import {validAdminTimestamp} from './admin-timestamp';

/** Canonical1142:36586. Privileged operations and their lifetime remain with the parent. */
@Component({
  selector: 'v2-admin-pending-review-dialog', standalone: true,
  imports: [DatePipe, AccessibleDialogDirective, V2ButtonDirective],
  templateUrl: './admin-pending-review-dialog.component.html', styleUrl: './admin-pending-review-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminPendingReviewDialogComponent {
  @Input({required: true}) view!: AdminPendingReviewView;
  @Input() focusReturnFallback: HTMLElement | null = null;
  @Input() focusReturnTarget: HTMLElement | null = null;
  @Output() readonly confirmed = new EventEmitter<void>();
  @Output() readonly retryReview = new EventEmitter<void>();
  @Output() readonly reconcile = new EventEmitter<void>();
  @Output() readonly dismissed = new EventEmitter<void>();
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');

  constructor() {
    afterEveryRender(() => {
      this.updateScrollableDetails();
      const panel = this.panel()?.nativeElement;
      if (!panel) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.contains(active) && !active.hasAttribute('disabled')) return;
      const safe = panel.querySelector<HTMLElement>('[appModalInitialFocus]:not([disabled])');
      (safe ?? panel).focus();
    });
  }

  @HostListener('window:resize')
  updateScrollableDetails(): void {
    const body = this.body()?.nativeElement;
    if (body) body.tabIndex = body.scrollHeight > body.clientHeight ? 0 : -1;
  }

  get busy(): boolean { return ['deleting', 'deleted-refreshing', 'reconciling'].includes(this.view.phase); }
  get createdAt(): string | null { return validAdminTimestamp(this.view.createdAt); }
  get isError(): boolean { return ['review-error', 'delete-error', 'deleted-read-error'].includes(this.view.phase); }
  get closeLabel(): string { return ['blocked', 'deleted-read-error', 'deleted-refreshing'].includes(this.view.phase) ? 'Close' : 'Cancel'; }
  get title(): string {
    switch (this.view.phase) {
      case 'reviewing': return 'Review incomplete registration';
      case 'blocked': return 'Registration kept';
      case 'eligible': return 'Delete incomplete registration?';
      case 'deleting': return 'Deleting registration';
      case 'review-error': return 'Review unavailable';
      case 'delete-error': return 'Deletion not confirmed';
      case 'deleted-read-error': case 'deleted-refreshing': return 'Registration deleted';
      case 'reconciling': return 'Checking deletion outcome';
    }
  }
  get description(): string {
    switch (this.view.phase) {
      case 'reviewing': return 'Checking this registration for linked data and credentials.';
      case 'blocked': return 'This registration cannot be deleted.';
      case 'eligible': return 'No linked data or credentials were found. This permanently deletes the reviewed registration and cannot be undone.';
      case 'deleting': return 'Deleting the reviewed registration. Please wait.';
      case 'review-error': return 'Could not review this registration. Nothing was deleted.';
      case 'delete-error': return 'We could not confirm the deletion. Refresh the user list before reviewing this registration again.';
      case 'deleted-read-error': return 'The deletion was confirmed, but the user list could not be refreshed. Refresh the list without deleting again.';
      case 'deleted-refreshing': return 'Refreshing the user list without repeating the deletion.';
      case 'reconciling': return 'Refreshing the user list to check whether this registration is still present.';
    }
  }
  confirm(): void { if (this.view.phase === 'eligible') this.confirmed.emit(); }
  retry(): void { if (this.view.phase === 'review-error') this.retryReview.emit(); }
  refresh(): void { if (this.view.phase === 'delete-error' || this.view.phase === 'deleted-read-error') this.reconcile.emit(); }
  dismiss(): void { if (!this.busy) this.dismissed.emit(); }
}
