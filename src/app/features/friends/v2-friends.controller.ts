import {Injectable, OnDestroy, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {Friend, FriendInvitation, FriendInvitationPreview, FriendRequest, FriendsService} from '@core/friends/friends.service';
import {FriendsFeedbackState} from '@shared/ui-v2/v2-friends-feedback.component';

interface FriendsInventory {friends: Friend[]; requests: FriendRequest[]; invitations: FriendInvitation[];}
interface Owner {actor: string; spotifyActor: string | null; generation: SessionGeneration;}
interface Intent {owner: Owner; kind: 'create' | 'receive' | 'respond' | 'revoke' | 'remove'; execute: () => Promise<void>;}

/** One route-owned workflow. Acknowledged mutations retry reads; uncertain mutations retry the same intent. */
@Injectable()
export class V2FriendsController implements OnDestroy {
  private readonly service = inject(FriendsService);
  private readonly auth = inject(SpotifyAuthService);
  private readonly lifecycle = inject(SessionLifecycleService);
  private readonly data = signal<FriendsInventory | null>(null);
  private readonly created = signal<{invitation: FriendInvitation; token: string} | null>(null);
  private readonly received = signal<FriendInvitationPreview | null>(null);
  private readonly creationStarted = signal(false);
  private readonly decision = signal<'accepted' | 'declined' | null>(null);
  private readonly state = signal<FriendsFeedbackState | ''>('');
  readonly feedback = this.state.asReadonly();
  private owner: Owner | null = null;
  private failedIntent: Intent | null = null;
  private revision = 0;
  private destroyed = false;
  private reviewUnavailable = false;

  constructor() {
    this.auth.logout$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.revision++; this.clear(); this.state.set('profile-required');
    });
  }

  inventory(): FriendsInventory | null {return this.owner && this.ownerCurrent(this.owner) ? this.data() : null;}
  createdInvitation(): {invitation: FriendInvitation; token: string} | null {
    return this.owner && this.ownerCurrent(this.owner) ? this.created() : null;
  }
  preview(): FriendInvitationPreview | null {return this.owner && this.ownerCurrent(this.owner) ? this.received() : null;}
  creationRequested(): boolean {return !!this.owner && this.ownerCurrent(this.owner) && this.creationStarted();}
  answered(): 'accepted' | 'declined' | null {return this.owner && this.ownerCurrent(this.owner) ? this.decision() : null;}
  canAct(): boolean {return !!this.inventory() && (this.feedback() === '' || this.feedback() === 'unavailable') && !this.destroyed;}

  async reload(): Promise<void> {
    this.resetChangedOwner();
    if (this.destroyed || this.auth.sessionExiting() || this.pending() || this.failedIntent) return;
    const owner = this.captureOwner();
    if (!owner) {this.clear(); this.state.set('profile-required'); return;}
    if (!this.owner || !this.ownerCurrent(this.owner)) this.clear();
    this.owner = owner;
    const revision = ++this.revision;
    this.state.set(this.data() ? 'refreshing' : 'loading');
    try {
      await this.read(owner, revision);
      if (this.current(owner, revision)) this.state.set(this.settledFeedback());
    } catch {
      if (this.current(owner, revision)) this.state.set('load-error');
    } finally {this.dropStale(owner, revision);}
  }

  async createInvitation(): Promise<void> {
    if (!this.canAct()) return;
    const owner = this.owner!;
    const token = this.service.createClaimToken();
    this.creationStarted.set(true);
    await this.mutate({owner, kind: 'create', execute: async () => {
      const invitation = await this.service.createInvitation(token);
      if (this.ownerCurrent(owner)) this.created.set(invitation.status === 'pending' ? {invitation, token} : null);
    }});
  }

  async receive(token: string): Promise<void> {
    if (!this.canAct()) return;
    const owner = this.owner!;
    this.received.set(null);
    this.decision.set(null);
    this.reviewUnavailable = false;
    await this.mutate({owner, kind: 'receive', execute: async () => {
      const preview = await this.service.receiveInvitation(token);
      if (this.ownerCurrent(owner)) this.received.set(preview);
    }});
  }

  async respond(requestId: string, accept: boolean): Promise<void> {
    if (!this.canAct() || !this.inventory()?.requests.some(item => item.requestId === requestId)) return;
    const owner = this.owner!;
    await this.mutate({owner, kind: 'respond', execute: async () => {
      await this.service.respondToRequest(requestId, accept);
      if (this.ownerCurrent(owner) && this.received()?.id === requestId) {
        this.received.set(null); this.decision.set(accept ? 'accepted' : 'declined');
      }
    }});
  }

  async revoke(invitationId: string): Promise<void> {
    if (!this.canAct() || !this.inventory()?.invitations.some(item => item.id === invitationId && item.status === 'pending')) return;
    const owner = this.owner!;
    await this.mutate({owner, kind: 'revoke', execute: async () => {
      await this.service.revokeInvitation(invitationId);
      if (this.ownerCurrent(owner) && this.created()?.invitation.id === invitationId) this.created.set(null);
    }});
  }

  async remove(friendUserId: string, expectedVersion?: string): Promise<void> {
    const friend = this.inventory()?.friends.find(item => item.userId === friendUserId);
    if (!this.canAct() || !friend || (expectedVersion !== undefined && friend.connectionVersion !== expectedVersion)) return;
    const version = friend.connectionVersion;
    await this.mutate({owner: this.owner!, kind: 'remove', execute: async () => {await this.service.removeFriend(friendUserId, version);}});
  }

  async retry(): Promise<void> {
    if (this.resetChangedOwner()) return;
    if (this.destroyed || this.pending() || this.feedback() === 'unavailable') return;
    const intent = this.failedIntent;
    if (intent) {
      await this.mutate(intent);
    } else await this.reload();
  }

  ngOnDestroy(): void {this.destroyed = true; this.revision++; this.clear();}

  private async mutate(intent: Intent): Promise<void> {
    // Public actions validate ownership and busy state synchronously before reaching here.
    // Retry resets changed owners (which also clears their intent); asynchronous completions
    // must still pass current() before publishing anything.
    const revision = ++this.revision;
    this.failedIntent = intent; this.state.set('busy');
    let acknowledged = false;
    try {
      await intent.execute();
      if (!this.current(intent.owner, revision)) return;
      acknowledged = true; this.failedIntent = null;
      await this.read(intent.owner, revision);
      if (this.current(intent.owner, revision)) this.state.set(this.settledFeedback());
    } catch (error) {
      if (this.current(intent.owner, revision)) {
        if (!acknowledged && intent.kind === 'receive' && (error as {code?: string} | null)?.code === '22023') {
          this.failedIntent = null; this.reviewUnavailable = true; this.state.set('unavailable');
        } else this.state.set(acknowledged ? 'load-error' : 'change-error');
      }
    } finally {this.dropStale(intent.owner, revision);}
  }

  private async read(owner: Owner, revision: number): Promise<void> {
    const [friends, requests, invitations] = await Promise.all([
      this.allPages((limit, offset) => this.service.listFriends(limit, offset), owner, revision),
      this.allPages((limit, offset) => this.service.listRequests(limit, offset), owner, revision),
      this.allPages((limit, offset) => this.service.listInvitations(limit, offset), owner, revision)
    ]);
    if (!this.current(owner, revision)) return;
    this.data.set({friends, requests, invitations});
    const created = this.created();
    if (created && !invitations.some(item => item.id === created.invitation.id && item.status === 'pending')) this.created.set(null);
    const preview = this.received();
    if (preview && !requests.some(item => item.requestId === preview.id)) {
      this.received.set(null); this.reviewUnavailable = true;
    }
  }

  private settledFeedback(): FriendsFeedbackState | '' {return this.reviewUnavailable ? 'unavailable' : '';}

  private async allPages<T>(read: (limit: number, offset: number) => Promise<T[]>, owner: Owner, revision: number): Promise<T[]> {
    const items: T[] = [];
    while (this.current(owner, revision)) {
      const page = await read(100, items.length);
      if (!this.current(owner, revision)) return [];
      items.push(...page);
      if (page.length < 100) return items;
    }
    return [];
  }

  private captureOwner(): Owner | null {
    const actor = this.auth.getSupabaseUserId();
    return actor && this.auth.hasCloudIdentity() ? {actor, spotifyActor: this.auth.getUserId(), generation: this.lifecycle.capture()} : null;
  }
  private ownerCurrent(owner: Owner): boolean {
    return !this.destroyed && !this.auth.sessionExiting() && owner.actor === this.auth.getSupabaseUserId() && owner.spotifyActor === this.auth.getUserId()
      && this.auth.hasCloudIdentity() && this.lifecycle.isCurrent(owner.generation);
  }
  private current(owner: Owner, revision: number): boolean {return revision === this.revision && this.ownerCurrent(owner);}
  private pending(): boolean {return ['loading', 'refreshing', 'busy'].includes(this.feedback());}
  private dropStale(owner: Owner, revision: number): void {if (revision === this.revision && !this.ownerCurrent(owner)) this.clear();}
  private resetChangedOwner(): boolean {
    if (!this.owner || this.ownerCurrent(this.owner)) return false;
    this.revision++; this.clear(); return true;
  }
  private clear(): void {
    this.data.set(null); this.created.set(null); this.received.set(null);
    this.creationStarted.set(false); this.decision.set(null);
    this.reviewUnavailable = false;
    this.state.set(''); this.owner = null; this.failedIntent = null;
  }
}
