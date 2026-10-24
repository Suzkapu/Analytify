import {ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, afterEveryRender, computed, effect, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {Friend, FriendInvitation} from '@core/friends/friends.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {DESIGN_V2_ACCOUNT_ACTIONS} from '@shared/layout/design-v2-shell/design-v2-account-actions';
import {V2ButtonDirective, V2OverflowMenuComponent, V2PageComponent} from '@shared/ui-v2/design-v2-primitives';
import {FriendsFeedbackState, V2FriendsFeedbackComponent} from '@shared/ui-v2/v2-friends-feedback.component';
import {V2FriendsController} from './v2-friends.controller';

type FriendsView = 'friends' | 'add' | 'invitations' | 'review';
const COPY: Record<FriendsView, readonly [string, string]> = {
  friends: ['Your friends', 'Share playlists, invite friends and discover music together.'],
  add: ['Add a friend', 'Share your invitation link or let a friend scan your QR code.'],
  invitations: ['Friend invitations', 'Manage pending invitations. Revoking one disables both its link and QR code.'],
  review: ['Friend invitation', 'Review who invited you before adding them as a friend.']
};

@Component({
  selector: 'v2-friends-page', standalone: true,
  imports: [RouterLink, V2PageComponent, V2ButtonDirective, V2OverflowMenuComponent, V2FriendsFeedbackComponent, AccessibleDialogDirective],
  templateUrl: './v2-friends-page.component.html', styleUrl: './v2-friends-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2FriendsPageComponent implements OnInit, OnDestroy {
  readonly controller = inject(V2FriendsController);
  readonly navigation = inject(DesignNavigationService);
  readonly account = inject(DESIGN_V2_ACCOUNT_ACTIONS, {optional: true});
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusOwner: HTMLElement | null = null;
  private confirmationTrigger: HTMLElement | null = null;
  private confirmedReturnFocus: HTMLElement | null = null;
  private readonly routeData = toSignal(this.route.data, {initialValue: this.route.snapshot.data});
  private readonly routeParams = toSignal(this.route.paramMap, {initialValue: this.route.snapshot.paramMap});
  readonly view = computed<FriendsView>(() => (this.routeData()['friendsView'] as FriendsView) || 'friends');
  readonly copy = computed(() => COPY[this.view()]);
  readonly removing = signal<Friend | null>(null);
  readonly revoking = signal<FriendInvitation | null>(null);
  readonly confirmation = computed(() => {
    const friend = this.removing();
    if (friend) return {title: `Remove ${friend.displayName}?`, description: 'Removes this person from your friends. You can send a new friend request later.', action: 'Remove friend'};
    return this.revoking() ? {title: 'Revoke friend invitation?', description: 'Disables this invitation’s private link and QR code. Existing friendships are unchanged.', action: 'Revoke invitation'} : null;
  });
  private readonly qrResult = signal<{url: string; image: string} | null>(null);
  readonly qr = computed(() => {
    const result = this.qrResult();
    return result?.url === this.invitationUrl() ? result.image : '';
  });
  readonly localFailure = signal<'qr' | 'copy' | null>(null);
  readonly localBusy = signal(false);
  readonly brokenImages = signal<readonly string[]>([]);
  readonly reviewToken = computed(() => this.routeParams().get('token'));
  private readonly completedToken = signal<string | null>(null);
  readonly preview = computed(() => this.completedToken() === this.reviewToken() ? this.controller.preview() : null);
  private readonly preparing = signal(false);
  private destroyed = false;
  private preparedToken: string | null = null;
  private presentationRevision = 0;

  constructor() {
    this.host.nativeElement.addEventListener('click', this.trackActionFocus, {capture: true});
    afterEveryRender(() => this.recoverActionFocus());
    effect(() => {
      if (this.controller.feedback() === 'profile-required') {
        this.presentationRevision++; this.qrResult.set(null); this.localFailure.set(null);
        this.localBusy.set(false); this.cancelConfirmation(); this.completedToken.set(null); this.preparedToken = null;
      }
    });
    effect(() => {
      this.controller.feedback();
      const add = this.view() === 'add' && (!this.controller.creationRequested() || (!!this.controller.createdInvitation() && !this.qr() && !this.localBusy() && !this.localFailure()));
      const token = this.reviewToken();
      const review = this.view() === 'review' && !!token && this.needsReceive(token);
      if (!this.preparing() && this.controller.canAct() && (add || review)) void this.prepare();
    });
  }
  /** Recover only an explicitly activated control; background updates never take focus. */
  private readonly trackActionFocus = (event: MouseEvent): void => {
    const control = (event.target as Element | null)?.closest<HTMLElement>('button, a');
    if (control && this.host.nativeElement.contains(control)) this.focusOwner = control;
  };
  @HostListener('document:focusin', ['$event'])
  relinquishActionFocus(event: FocusEvent): void {
    if (this.focusOwner && event.target !== this.focusOwner) {
      // A confirmed dialog restores its opening control before the mutation's
      // read may remove it. Keep that one known handoff; user movement ends ownership.
      this.focusOwner = event.target === this.confirmedReturnFocus ? this.confirmedReturnFocus : null;
    }
    this.confirmedReturnFocus = null;
  }
  private recoverActionFocus(): void {
    const owner = this.focusOwner;
    if (!owner || this.destroyed) return;
    const active = document.activeElement;
    if (active !== owner && active !== document.body) {this.focusOwner = null; this.confirmedReturnFocus = null; return;}
    if (owner.isConnected && !owner.matches(':disabled')) return;
    this.confirmedReturnFocus = null;
    const feedback = this.host.nativeElement.querySelector<HTMLElement>('v2-friends-feedback > section');
    const destination = feedback || this.host.nativeElement.closest('main');
    this.focusOwner = feedback;
    if (destination) {destination.tabIndex = -1; destination.focus({preventScroll: true});}
  }
  async ngOnInit(): Promise<void> {await this.prepare();}
  ngOnDestroy(): void {
    this.destroyed = true; this.focusOwner = null; this.confirmationTrigger = null; this.confirmedReturnFocus = null;
    this.host.nativeElement.removeEventListener('click', this.trackActionFocus, {capture: true});
    this.presentationRevision++; this.qrResult.set(null);
  }
  async prepare(): Promise<void> {
    if (this.preparing() || this.destroyed) return;
    this.preparing.set(true);
    try {
      if (!this.controller.inventory()) await this.controller.reload();
      if (this.destroyed || !this.controller.canAct()) return;
      if (this.view() === 'add') {
        if (!this.controller.creationRequested()) await this.controller.createInvitation();
        if (!this.destroyed && !this.qr()) await this.generateQr();
      } else {
        const token = this.reviewToken();
        if (this.view() === 'review' && token) {
          if (this.needsReceive(token)) {
            this.preparedToken = token;
            await this.controller.receive(token);
          }
          if (!this.destroyed && this.reviewToken() === token && this.controller.preview()) this.completedToken.set(token);
        }
      }
    } finally {if (!this.destroyed) this.preparing.set(false);}
  }
  feedback(): FriendsFeedbackState | '' {
    if (this.localFailure()) return 'change-error';
    const state = this.controller.feedback();
    if (state && (state !== 'unavailable' || this.view() === 'review')) return state;
    if (this.view() === 'add' && this.controller.creationRequested() && !this.controller.createdInvitation()) return 'owner-unavailable';
    if (this.view() === 'review' && this.completedToken() === this.reviewToken()) return this.controller.answered() || '';
    return '';
  }
  async createNewInvitation(): Promise<void> {
    if (this.feedback() !== 'owner-unavailable' || !this.controller.canAct() || this.localBusy()) return;
    await this.controller.createInvitation();
    if (!this.destroyed) await this.prepare();
  }
  async openFriends(): Promise<void> {await this.router.navigate(this.navigation.commands('friends'));}
  async retry(): Promise<void> {
    if (this.localBusy()) return;
    if (this.localFailure() === 'qr') {await this.generateQr(); return;}
    if (this.localFailure() === 'copy') {await this.copyLink(); return;}
    await this.controller.retry();
    if (this.controller.canAct()) await this.prepare();
  }
  invitationUrl(): string {
    const created = this.controller.createdInvitation();
    return created ? new URL('friends/invite/' + created.token, document.baseURI).href : '';
  }
  async generateQr(): Promise<void> {
    const url = this.invitationUrl();
    if (!url || !this.controller.canAct() || this.destroyed || this.localBusy()) return;
    const revision = ++this.presentationRevision;
    this.localBusy.set(true); this.localFailure.set(null); this.qrResult.set(null);
    try {
      const {default: qrCode} = await import('qrcode');
      const image = await qrCode.toDataURL(url, {width: 176, margin: 4, errorCorrectionLevel: 'M'});
      if (this.presentationCurrent(url, revision)) this.qrResult.set({url, image});
    } catch {if (this.presentationCurrent(url, revision)) this.localFailure.set('qr');}
    finally {if (!this.destroyed && revision === this.presentationRevision) this.localBusy.set(false);}
  }
  async copyLink(): Promise<void> {
    const url = this.invitationUrl();
    if (!url || !this.controller.canAct() || this.destroyed || this.localBusy()) return;
    const revision = ++this.presentationRevision;
    this.localBusy.set(true); this.localFailure.set(null);
    try {await navigator.clipboard.writeText(url);}
    catch {if (this.presentationCurrent(url, revision)) this.localFailure.set('copy');}
    finally {if (!this.destroyed && revision === this.presentationRevision) this.localBusy.set(false);}
  }
  requestRemoval(friend: Friend): void {if (this.controller.canAct()) {this.confirmationTrigger = document.activeElement as HTMLElement | null; this.revoking.set(null); this.removing.set(friend);}}
  requestRevocation(invitation: FriendInvitation): void {if (this.controller.canAct()) {this.confirmationTrigger = document.activeElement as HTMLElement | null; this.removing.set(null); this.revoking.set(invitation);}}
  cancelConfirmation(): void {this.confirmedReturnFocus = null; this.confirmationTrigger = null; this.removing.set(null); this.revoking.set(null);}
  async confirmPendingAction(): Promise<void> {
    const invitation = this.revoking();
    if (!invitation) {await this.confirmRemoval(); return;}
    if (!this.controller.canAct()) return;
    this.confirmedReturnFocus = this.confirmationTrigger; this.confirmationTrigger = null;
    this.revoking.set(null);
    await this.controller.revoke(invitation.id);
  }
  async confirmRemoval(): Promise<void> {
    const friend = this.removing();
    if (!friend || !this.controller.canAct()) return;
    this.confirmedReturnFocus = this.confirmationTrigger; this.confirmationTrigger = null;
    this.removing.set(null);
    await this.controller.remove(friend.userId, friend.connectionVersion);
  }
  imageFailed(url: string): void {this.brokenImages.update(items => [...items, url]);}
  private needsReceive(token: string): boolean {
    return this.preparedToken !== token || (this.controller.feedback() !== 'unavailable' && !this.controller.preview() && !this.controller.answered());
  }
  private presentationCurrent(url: string, revision: number): boolean {
    return !this.destroyed && revision === this.presentationRevision && url === this.invitationUrl();
  }
}
