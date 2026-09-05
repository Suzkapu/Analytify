import {Injectable} from '@angular/core';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {RealtimeChannel} from '@supabase/supabase-js';
import {CompareRoomEnvelope, CompareRoomMessage} from './compare-room.models';
import {assertCompareMessageBounds} from './compare-room-integrity';

@Injectable({providedIn: 'root'})
export class CompareRoomTransportService {
  private channel: RealtimeChannel | null = null;
  private roomId = '';

  constructor(private supabase: SupabaseService) {}

  async createRoom(roomId: string, hostParticipantId: string): Promise<void> {
    await this.supabase.ensureCollaborationSession();
    const {error} = await this.supabase.client.rpc('create_compare_room', {
      p_room_id: roomId,
      p_host_participant_id: hostParticipantId
    });
    if (error) throw error;
  }

  async createInvitation(invitationId: string, invitationSecret: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('create_compare_room_invitation', {
      p_room_id: this.roomId,
      p_invitation_id: invitationId,
      p_invitation_secret: invitationSecret
    });
    if (error) throw error;
  }

  async claimInvitation(roomId: string, invitationId: string, invitationSecret: string, participantId: string): Promise<void> {
    await this.supabase.ensureCollaborationSession();
    const {error} = await this.supabase.client.rpc('claim_compare_room_invitation', {
      p_room_id: roomId,
      p_invitation_id: invitationId,
      p_invitation_secret: invitationSecret,
      p_participant_id: participantId
    });
    if (error) throw error;
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const {error} = await this.supabase.client.rpc('revoke_compare_room_invitation', {
      p_room_id: this.roomId,
      p_invitation_id: invitationId
    });
    if (error) throw error;
  }

  async connect(roomId: string, onMessage: (envelope: CompareRoomEnvelope) => void): Promise<void> {
    await this.disconnect();
    await this.supabase.ensureCollaborationSession();
    this.roomId = roomId;
    this.channel = this.supabase.client.channel(`compare-room:${roomId}`, {
      config: {private: true}
    });
    this.channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'compare_room_messages', filter: `room_id=eq.${roomId}`
    }, payload => {
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

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Could not connect to the Compare Room.')), 10_000);
      this.channel?.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          window.clearTimeout(timeout);
          reject(new Error('The Compare Room realtime connection failed.'));
        }
      });
    });
  }

  async send(message: CompareRoomMessage): Promise<void> {
    if (!this.channel || !this.roomId) throw new Error('The Compare Room is not connected.');
    assertCompareMessageBounds(message);
    const {error} = await this.supabase.client.rpc('send_compare_room_message', {
      p_room_id: this.roomId,
      p_message: message
    });
    if (error) throw error;
  }

  async closeRoom(): Promise<void> {
    const {error} = await this.supabase.client.rpc('close_compare_room', {p_room_id: this.roomId});
    if (error) throw error;
  }

  async disconnect(): Promise<void> {
    if (!this.channel) {
      this.roomId = '';
      return;
    }
    const current = this.channel;
    this.channel = null;
    this.roomId = '';
    await this.supabase.client.removeChannel(current);
  }
}
