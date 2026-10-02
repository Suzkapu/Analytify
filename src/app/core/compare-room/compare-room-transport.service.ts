import {Injectable} from '@angular/core';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import type {RealtimeChannel} from '@supabase/supabase-js';
import {CompareRoomEnvelope, CompareRoomMessage} from './compare-room.models';
import {assertCompareMessageBounds} from './compare-room-integrity';

@Injectable({providedIn: 'root'})
export class CompareRoomTransportService {
  private channel: RealtimeChannel | null = null;
  private roomId = '';
  private connectionGeneration = 0;
  private removeCurrentChannel: (() => Promise<unknown>) | null = null;
  private cancelSubscription: (() => void) | null = null;

  constructor(private supabase: SupabaseService) {}

  async createRoom(roomId: string, hostParticipantId: string): Promise<void> {
    await this.supabase.ensureCollaborationSession();
    const {error} = await (await this.supabase.getClient()).rpc('create_compare_room', {
      p_room_id: roomId,
      p_host_participant_id: hostParticipantId
    });
    if (error) throw error;
  }

  async createInvitation(invitationId: string, invitationSecret: string): Promise<void> {
    const {error} = await this.roomRpc('create_compare_room_invitation', {
      p_invitation_id: invitationId,
      p_invitation_secret: invitationSecret
    });
    if (error) throw error;
  }

  async claimInvitation(roomId: string, invitationId: string, invitationSecret: string, participantId: string): Promise<void> {
    await this.supabase.ensureCollaborationSession();
    const {error} = await (await this.supabase.getClient()).rpc('claim_compare_room_invitation', {
      p_room_id: roomId,
      p_invitation_id: invitationId,
      p_invitation_secret: invitationSecret,
      p_participant_id: participantId
    });
    if (error) throw error;
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const {error} = await this.roomRpc('revoke_compare_room_invitation', {
      p_invitation_id: invitationId
    });
    if (error) throw error;
  }

  async connect(roomId: string, onMessage: (envelope: CompareRoomEnvelope) => void): Promise<void> {
    const cleanup = this.disconnect();
    const generation = this.connectionGeneration;
    await cleanup;
    await this.supabase.ensureCollaborationSession();
    const client = await this.supabase.getClient();
    if (generation !== this.connectionGeneration) throw new Error('Compare Room connection was cancelled.');
    this.roomId = roomId;
    const channel = client.channel(`compare-room:${roomId}`, {
      config: {private: true}
    });
    this.channel = channel;
    this.removeCurrentChannel = () => client.removeChannel(channel);
    channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'compare_room_messages', filter: `room_id=eq.${roomId}`
    }, payload => {
      if (generation !== this.connectionGeneration) return;
      const row = payload?.new as any;
      const message = row?.payload as CompareRoomMessage | undefined;
      if (!message?.type) return;
      onMessage({
        id: Number(row.id),
        senderParticipantId: row.sender_participant_id,
        senderRole: row.sender_role,
        sequence: Number(row.sequence),
        message
      });
    });

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          if (this.cancelSubscription === cancel) this.cancelSubscription = null;
          if (error) reject(error);
          else resolve();
        };
        const cancel = () => finish(new Error('Compare Room connection was cancelled.'));
        const timeout = window.setTimeout(() => finish(new Error('Could not connect to the Compare Room.')), 10_000);
        this.cancelSubscription = cancel;
        channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          finish();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          finish(new Error('The Compare Room realtime connection failed.'));
        }
        });
      });
    } catch (error) {
      if (generation === this.connectionGeneration) await this.disconnect();
      throw error;
    }
  }

  async send(message: CompareRoomMessage): Promise<void> {
    if (!this.channel || !this.roomId) throw new Error('The Compare Room is not connected.');
    assertCompareMessageBounds(message);
    const {error} = await this.roomRpc('send_compare_room_message', {
      p_message: message
    });
    if (error) throw error;
  }

  async sendCreation(message: Extract<CompareRoomMessage, {type:
    'create-playlist-start' | 'create-playlist-track-chunk' | 'create-playlist-commit'}>): Promise<void> {
    if (!this.channel || !this.roomId) throw new Error('The Compare Room is not connected.');
    assertCompareMessageBounds(message);
    const {error} = await this.roomRpc('send_compare_room_creation_message', {
      p_message: message
    });
    if (error) throw error;
  }

  async closeRoom(): Promise<void> {
    const {error} = await this.roomRpc('close_compare_room');
    if (error) throw error;
  }

  async touchPresence(): Promise<void> {
    if (!this.roomId) return;
    const {error} = await this.roomRpc('touch_compare_room_presence');
    if (error) throw error;
  }

  async reconcileParticipants(): Promise<string[]> {
    if (!this.roomId) return [];
    const {data, error} = await this.roomRpc('reconcile_compare_room_participants');
    if (error) throw error;
    return (data || []).map((row: {participant_id: string}) => row.participant_id);
  }

  async leaveRoom(): Promise<void> {
    if (!this.roomId) return;
    const {error} = await this.roomRpc('leave_compare_room');
    if (error) throw error;
  }

  private async roomRpc(name: string, parameters: Record<string, unknown> = {}) {
    const generation = this.connectionGeneration;
    const roomId = this.roomId;
    const client = await this.supabase.getClient();
    if (generation !== this.connectionGeneration || roomId !== this.roomId) {
      throw new DOMException('Compare Room request was cancelled.', 'AbortError');
    }
    return client.rpc(name, {...parameters, p_room_id: roomId});
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++;
    this.cancelSubscription?.();
    this.cancelSubscription = null;
    const remove = this.removeCurrentChannel;
    this.removeCurrentChannel = null;
    this.channel = null;
    this.roomId = '';
    if (remove) await remove();
  }
}
