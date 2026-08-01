import {Injectable} from '@angular/core';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {RealtimeChannel} from '@supabase/supabase-js';
import {CompareRoomMessage} from './compare-room.models';

@Injectable({providedIn: 'root'})
export class CompareRoomTransportService {
  private channel: RealtimeChannel | null = null;

  constructor(private supabase: SupabaseService) {}

  async connect(roomId: string, onMessage: (message: CompareRoomMessage) => void): Promise<void> {
    await this.disconnect();
    this.channel = this.supabase.client.channel(`compare-room:${roomId}`, {
      config: {broadcast: {self: false}}
    });
    this.channel.on('broadcast', {event: 'room-message'}, payload => {
      const message = payload?.['payload'] as CompareRoomMessage | undefined;
      if (message?.type) onMessage(message);
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
    if (!this.channel) throw new Error('The Compare Room is not connected.');
    const status = await this.channel.send({
      type: 'broadcast',
      event: 'room-message',
      payload: message
    });
    if (status !== 'ok') throw new Error('The Compare Room message could not be delivered.');
  }

  async disconnect(): Promise<void> {
    if (!this.channel) return;
    const current = this.channel;
    this.channel = null;
    await this.supabase.client.removeChannel(current);
  }
}
