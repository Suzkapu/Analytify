import {Injectable, InjectionToken, inject} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

/** Enable only when the application client points at an isolated backend with the Friends migration.
 * The shared backend has no deployed Friends contract and must never be used as a fallback. */
export const DESIGN_V2_FRIENDS_BACKEND_READY = new InjectionToken<boolean>('Isolated Friends backend ready', {
  providedIn: 'root', factory: () => false
});

export type FriendInvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';
export interface Friend {userId: string; displayName: string; imageUrl: string; connectedAt: string; connectionVersion: string;}
export interface FriendRequest {requestId: string; inviterUserId: string; displayName: string; imageUrl: string; createdAt: string;}
export interface FriendInvitation {id: string; status: FriendInvitationStatus; createdAt: string; respondedAt?: string | null;}
export interface FriendInvitationPreview {id: string; inviterUserId: string; displayName: string; imageUrl: string;}
export interface FriendDecision {id: string; status: 'accepted' | 'declined'; isConnected: boolean;}

function row(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || fields.some(field => typeof (value as Record<string, unknown>)[field] !== 'string')) {
    throw new Error('Invalid Friends response.');
  }
  return value as Record<string, unknown>;
}

function invitation(value: unknown): FriendInvitation {
  const item = row(value, ['id', 'status', 'createdAt']);
  if (!['pending', 'accepted', 'declined', 'revoked'].includes(item['status'] as string)) throw new Error('Invalid Friends response.');
  return {id: item['id'] as string, status: item['status'] as FriendInvitationStatus, createdAt: item['createdAt'] as string,
    respondedAt: typeof item['respondedAt'] === 'string' ? item['respondedAt'] : null};
}

/** Actor-owned RPC adapter. Callers retain creation tokens/decisions across uncertain outcomes.
 * No secrets, cached rows or friend status are written to browser storage by this boundary. */
@Injectable({providedIn: 'root'})
export class FriendsService {
  private readonly auth = inject(SpotifyAuthService);
  private readonly lifecycle = inject(SessionLifecycleService);
  private readonly supabase = inject(SupabaseService);
  private readonly backendReady = inject(DESIGN_V2_FRIENDS_BACKEND_READY);

  createClaimToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async listFriends(limit = 50, offset = 0): Promise<Friend[]> {
    const data = await this.page('list_friends', limit, offset);
    return data.map(value => {
      const item = row(value, ['userId', 'displayName', 'imageUrl', 'connectedAt', 'connectionVersion']);
      return {userId: item['userId'] as string, displayName: item['displayName'] as string,
        imageUrl: item['imageUrl'] as string, connectedAt: item['connectedAt'] as string,
        connectionVersion: item['connectionVersion'] as string};
    });
  }

  async listRequests(limit = 50, offset = 0): Promise<FriendRequest[]> {
    const data = await this.page('list_friend_requests', limit, offset);
    return data.map(value => {
      const item = row(value, ['requestId', 'inviterUserId', 'displayName', 'imageUrl', 'createdAt']);
      return {requestId: item['requestId'] as string, inviterUserId: item['inviterUserId'] as string,
        displayName: item['displayName'] as string, imageUrl: item['imageUrl'] as string, createdAt: item['createdAt'] as string};
    });
  }

  async listInvitations(limit = 50, offset = 0): Promise<FriendInvitation[]> {
    return (await this.page('list_friend_invitations', limit, offset)).map(invitation);
  }

  async createInvitation(token: string): Promise<FriendInvitation> {
    this.requireToken(token);
    const result = invitation(await this.rpc('create_friend_invitation', {p_claim_token: token}));
    return {id: result.id, status: result.status, createdAt: result.createdAt};
  }

  async receiveInvitation(token: string): Promise<FriendInvitationPreview> {
    this.requireToken(token);
    const item = row(await this.rpc('receive_friend_invitation', {p_claim_token: token}),
      ['id', 'inviterUserId', 'displayName', 'imageUrl']);
    return {id: item['id'] as string, inviterUserId: item['inviterUserId'] as string,
      displayName: item['displayName'] as string, imageUrl: item['imageUrl'] as string};
  }

  async respondToRequest(requestId: string, accept: boolean): Promise<FriendDecision> {
    const item = row(await this.rpc('respond_friend_request', {p_invitation_id: requestId, p_accept: accept}), ['id', 'status']);
    if (!['accepted', 'declined'].includes(item['status'] as string) || typeof item['isConnected'] !== 'boolean') {
      throw new Error('Invalid Friends response.');
    }
    return {id: item['id'] as string, status: item['status'] as 'accepted' | 'declined', isConnected: item['isConnected']};
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    await this.rpc('revoke_friend_invitation', {p_invitation_id: invitationId});
  }

  async removeFriend(friendUserId: string, connectionVersion: string): Promise<void> {
    await this.rpc('remove_friend', {p_friend_user_id: friendUserId, p_connection_version: connectionVersion});
  }

  private requireToken(token: string): void {
    if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('Invalid invitation token.'), {code: '22023'});
  }

  private async page(name: string, limit: number, offset: number): Promise<unknown[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      throw new Error('Invalid Friends page.');
    }
    const data = await this.rpc(name, {p_limit: limit, p_offset: offset});
    if (!Array.isArray(data)) throw new Error('Invalid Friends response.');
    return data;
  }

  private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    if (!this.backendReady) throw new Error('Friends requires the isolated development backend.');
    const actor = this.auth.getSupabaseUserId();
    if (!actor || !this.auth.hasCloudIdentity()) throw new Error('A verified Spotify account is required.');
    const generation = this.lifecycle.capture();
    const client = await this.supabase.getClient();
    this.requireCurrent(actor, generation);
    const session = await client.auth.getSession();
    this.requireCurrent(actor, generation);
    if (session.error) throw session.error;
    if (session.data.session?.user.id !== actor) throw new Error('The Friends account changed.');
    const result = await this.lifecycle.track(
      Promise.resolve(client.rpc(name, parameters).abortSignal(generation.signal)), generation);
    this.requireCurrent(actor, generation);
    if (result.error) throw result.error;
    return result.data;
  }

  private requireCurrent(actor: string, generation: SessionGeneration): void {
    if (this.auth.getSupabaseUserId() !== actor || !this.auth.hasCloudIdentity() || !this.lifecycle.isCurrent(generation)) {
      throw new Error('The Friends account changed.');
    }
  }
}
