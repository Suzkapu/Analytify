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
  songLeagueSongAddedEnabled: boolean;
  songLeagueMember: boolean;
  statsAccessRequestsEnabled: boolean;
  active: boolean;
  songAddedActive: boolean;
  statsAccessActive: boolean;
}

@Injectable({providedIn: 'root'})
export class PushNotificationService {
  constructor(
    private swPush: SwPush,
    private supabase: SupabaseService
  ) {}

  async loadSettings(): Promise<PushNotificationSettings> {
    const [preferenceResult, subscription, permission] = await Promise.all([
      this.supabase.client.rpc('get_notification_preferences'),
      this.currentSubscription(),
      this.currentPermission()
    ]);
    if (preferenceResult.error) throw preferenceResult.error;
    const row = Array.isArray(preferenceResult.data)
      ? preferenceResult.data[0]
      : preferenceResult.data;
    const songLeagueEnabled = !!row?.song_league_enabled;
    const songLeagueSongAddedEnabled = !!row?.song_league_song_added_enabled;
    const songLeagueMember = !!row?.song_league_member;
    const statsAccessRequestsEnabled = row?.stats_access_requests_enabled !== false;
    if ((songLeagueEnabled || songLeagueSongAddedEnabled || statsAccessRequestsEnabled)
      && subscription && permission === 'granted') {
      await this.registerDevice(subscription);
    }
    return this.settings(
      songLeagueEnabled, songLeagueSongAddedEnabled, songLeagueMember, statsAccessRequestsEnabled,
      !!subscription, permission
    );
  }

  async setSongLeagueEnabled(enabled: boolean): Promise<PushNotificationSettings> {
    return this.setCategoryEnabled('song_league', enabled);
  }

  async setSongLeagueSongAddedEnabled(enabled: boolean): Promise<PushNotificationSettings> {
    return this.setCategoryEnabled('song_league_song_added', enabled);
  }

  async setStatsAccessRequestsEnabled(enabled: boolean): Promise<PushNotificationSettings> {
    return this.setCategoryEnabled('stats_access_requests', enabled);
  }

  private async setCategoryEnabled(
    category: 'song_league' | 'song_league_song_added' | 'stats_access_requests',
    enabled: boolean
  ): Promise<PushNotificationSettings> {
    let subscription = await this.currentSubscription();
    if (enabled) {
      if (!this.swPush.isEnabled) {
        throw new Error('Push notifications are not supported by this browser or PWA installation.');
      }
      const permission = await this.currentPermission();
      if (permission === 'denied') {
        throw new Error('Notifications are blocked. Allow them in the browser or site settings first.');
      }
      if (!subscription || permission !== 'granted') {
        try {
          subscription = await this.swPush.requestSubscription({
            serverPublicKey: environment.vapidPublicKey
          });
        } catch (error) {
          // Some browsers finish registration before resolving (or reject a
          // duplicate request). Reconcile the actual PushManager state before
          // reporting a failure to somebody who already granted access.
          subscription = await this.currentSubscription();
          if (!subscription) {
            const refreshedPermission = await this.currentPermission();
            if (refreshedPermission === 'denied') {
              throw new Error('Notifications are blocked. Allow them in the browser or site settings first.');
            }
            throw new Error(refreshedPermission === 'granted'
              ? 'Browser permission is enabled, but its push service could not register this device. Reopen the installed app and try again.'
              : 'Notification permission was not granted.');
          }
        }
      }
      await this.registerDevice(subscription);
    }

    const preference = await this.supabase.client.rpc('set_notification_preference', {
      p_category: category,
      p_enabled: enabled
    });
    if (preference.error) throw preference.error;
    const settings = await this.loadSettings();
    if (!enabled || !subscription || settings.deviceSubscribed) return settings;

    // PushManager/SwPush may publish the new subscription one tick after
    // requestSubscription resolves. The returned subscription is already the
    // authoritative registration for this action, so keep the UI in sync
    // instead of briefly flipping the newly enabled toggle back off.
    return {
      ...settings,
      deviceSubscribed: true,
      active: settings.songLeagueEnabled && settings.permission === 'granted',
      songAddedActive: settings.songLeagueSongAddedEnabled && settings.permission === 'granted',
      statsAccessActive: settings.statsAccessRequestsEnabled && settings.permission === 'granted'
    };
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) return null;
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) return subscription;
      } catch {
        // Fall back to Angular's service-worker abstraction below.
      }
    }
    return await firstValueFrom(this.swPush.subscription);
  }

  private async registerDevice(subscription: PushSubscription): Promise<void> {
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

  private async currentPermission(): Promise<NotificationPermission | 'unavailable'> {
    if (typeof Notification === 'undefined') return 'unavailable';
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({name: 'notifications' as PermissionName});
        return status.state === 'prompt' ? 'default' : status.state as NotificationPermission;
      } catch {
        // Safari versions without the notifications permission descriptor are
        // still accurately represented by Notification.permission.
      }
    }
    return Notification.permission;
  }

  private settings(
    songLeagueEnabled: boolean,
    songLeagueSongAddedEnabled: boolean,
    songLeagueMember: boolean,
    statsAccessRequestsEnabled: boolean,
    deviceSubscribed: boolean,
    permission: NotificationPermission | 'unavailable'
  ): PushNotificationSettings {
    return {
      supported: this.swPush.isEnabled,
      installedPwa: this.isInstalledPwa(),
      permission,
      deviceSubscribed,
      songLeagueEnabled,
      songLeagueSongAddedEnabled,
      songLeagueMember,
      statsAccessRequestsEnabled,
      active: songLeagueEnabled && deviceSubscribed && permission === 'granted',
      songAddedActive: songLeagueSongAddedEnabled && deviceSubscribed && permission === 'granted',
      statsAccessActive: statsAccessRequestsEnabled && deviceSubscribed && permission === 'granted'
    };
  }

  private isInstalledPwa(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
      || !!(window.navigator as Navigator & {standalone?: boolean}).standalone;
  }
}
