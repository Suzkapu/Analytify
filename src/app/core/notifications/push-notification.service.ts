import {Injectable} from '@angular/core';
import {SwPush} from '@angular/service-worker';
import {firstValueFrom} from 'rxjs';

import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {environment} from '@env/environment';

export interface PushNotificationSettings {
  supported: boolean;
  installedPwa: boolean;
  permission: NotificationPermission | 'unavailable';
  deviceSubscribed: boolean;
  songLeagueEnabled: boolean;
}

@Injectable({providedIn: 'root'})
export class PushNotificationService {
  constructor(
    private swPush: SwPush,
    private supabase: SupabaseService
  ) {}

  async loadSettings(): Promise<PushNotificationSettings> {
    const [preferenceResult, subscription] = await Promise.all([
      this.supabase.client.rpc('get_notification_preferences'),
      this.currentSubscription()
    ]);
    if (preferenceResult.error) throw preferenceResult.error;
    const row = Array.isArray(preferenceResult.data)
      ? preferenceResult.data[0]
      : preferenceResult.data;
    return this.settings(!!row?.song_league_enabled, !!subscription);
  }

  async setSongLeagueEnabled(enabled: boolean): Promise<PushNotificationSettings> {
    let subscription = await this.currentSubscription();
    if (enabled) {
      if (!this.swPush.isEnabled) {
        throw new Error('Push notifications are not supported by this browser or PWA installation.');
      }
      subscription ||= await this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey
      });
      const json = subscription.toJSON();
      const endpoint = json.endpoint || subscription.endpoint;
      const p256dh = json.keys?.['p256dh'] || '';
      const auth = json.keys?.['auth'] || '';
      if (!endpoint || !p256dh || !auth) {
        throw new Error('The browser returned an incomplete push subscription.');
      }
      const registration = await this.supabase.client.rpc('upsert_push_subscription', {
        p_endpoint: endpoint,
        p_p256dh: p256dh,
        p_auth: auth,
        p_user_agent: typeof navigator === 'undefined' ? '' : navigator.userAgent
      });
      if (registration.error) throw registration.error;
    }

    const preference = await this.supabase.client.rpc('set_notification_preference', {
      p_category: 'song_league',
      p_enabled: enabled
    });
    if (preference.error) throw preference.error;
    return this.settings(enabled, !!subscription);
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) return null;
    return await firstValueFrom(this.swPush.subscription);
  }

  private settings(songLeagueEnabled: boolean, deviceSubscribed: boolean): PushNotificationSettings {
    return {
      supported: this.swPush.isEnabled,
      installedPwa: this.isInstalledPwa(),
      permission: typeof Notification === 'undefined' ? 'unavailable' : Notification.permission,
      deviceSubscribed,
      songLeagueEnabled
    };
  }

  private isInstalledPwa(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
      || !!(window.navigator as Navigator & {standalone?: boolean}).standalone;
  }
}
