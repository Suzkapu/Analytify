import {Injectable, inject} from '@angular/core';
import {SwPush} from '@angular/service-worker';
import {firstValueFrom} from 'rxjs';

import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {environment} from '@env/environment';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';

interface NotificationSession {
  actor: string | null;
  cloud: string | null;
  generation: SessionGeneration;
}

export interface PushNotificationSettings {
  supported: boolean;
  installedPwa: boolean;
  permission: NotificationPermission | 'unavailable';
  deviceSubscribed: boolean;
  deviceRegistered: boolean;
  registeredDeviceCount: number;
  deviceState: 'unsupported' | 'denied' | 'permission-required' | 'subscription-missing' | 'server-only' | 'registered';
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
  private readonly auth = inject(SpotifyAuthService);
  private readonly lifecycle = inject(SessionLifecycleService);
  constructor(
    private swPush: SwPush,
    private supabase: SupabaseService
  ) {}

  async loadSettings(): Promise<PushNotificationSettings> {
    return this.readSettings(this.captureSession(), true);
  }

  private captureSession(): NotificationSession {
    const session = {actor: this.auth.getUserId(), cloud: this.auth.getSupabaseUserId(), generation: this.lifecycle.capture()};
    this.requireCurrent(session);
    return session;
  }

  private requireCurrent(session: NotificationSession): void {
    if (!session.actor || !this.lifecycle.isCurrent(session.generation)
      || session.actor !== this.auth.getUserId() || session.cloud !== this.auth.getSupabaseUserId()) {
      throw new DOMException('Notification session changed.', 'AbortError');
    }
  }

  private async request(session: NotificationSession,
    name: 'get_notification_settings' | 'set_notification_preference' | 'upsert_push_subscription',
    parameters: Record<string, string | boolean | null>) {
    const client = await this.supabase.getClient();
    this.requireCurrent(session);
    const result = await this.lifecycle.track(Promise.resolve(client.rpc(name, parameters)
      .abortSignal(session.generation.signal)), session.generation);
    this.requireCurrent(session);
    if (result.error) throw result.error;
    return result.data;
  }

  private async readSettings(session: NotificationSession, registerMissingDevice: boolean): Promise<PushNotificationSettings> {
    const [subscription, permission] = await Promise.all([
      this.currentSubscription(),
      this.currentPermission()
    ]);
    this.requireCurrent(session);
    const endpoint = subscription?.endpoint || subscription?.toJSON().endpoint || null;
    const data = await this.request(session, 'get_notification_settings', {
      p_endpoint: endpoint
    });
    const row = Array.isArray(data) ? data[0] : data;
    const songLeagueEnabled = !!row?.song_league_enabled;
    const songLeagueSongAddedEnabled = !!row?.song_league_song_added_enabled;
    const songLeagueMember = !!row?.song_league_member;
    const statsAccessRequestsEnabled = row?.stats_access_requests_enabled !== false;
    let deviceRegistered = !!row?.device_registered;
    let registeredDeviceCount = Number(row?.registered_device_count || 0);
    if (registerMissingDevice && (songLeagueEnabled || songLeagueSongAddedEnabled || statsAccessRequestsEnabled)
      && subscription && permission === 'granted' && !deviceRegistered) {
      await this.registerDevice(session, subscription);
      deviceRegistered = true;
      registeredDeviceCount = Math.max(1, registeredDeviceCount);
    }
    return this.settings(
      songLeagueEnabled, songLeagueSongAddedEnabled, songLeagueMember, statsAccessRequestsEnabled,
      !!subscription, deviceRegistered, registeredDeviceCount, permission
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

  /** Save a category without requesting permission or registering this device. */
  async setCategoryPreference(
    category: 'song_league' | 'song_league_song_added' | 'stats_access_requests',
    enabled: boolean
  ): Promise<PushNotificationSettings> {
    const session = this.captureSession();
    await this.request(session, 'set_notification_preference', {
      p_category: category, p_enabled: enabled
    });
    return this.readSettings(session, false);
  }

  private async setCategoryEnabled(
    category: 'song_league' | 'song_league_song_added' | 'stats_access_requests',
    enabled: boolean
  ): Promise<PushNotificationSettings> {
    const session = this.captureSession();
    const subscription = enabled ? await this.ensureDeviceSubscription(session) : null;

    await this.request(session, 'set_notification_preference', {
      p_category: category,
      p_enabled: enabled
    });
    const settings = await this.readSettings(session, true);
    return subscription ? this.reconcileDevice(settings) : settings;
  }

  /** Enable this device without modifying any saved notification categories. */
  async enableDevice(): Promise<PushNotificationSettings> {
    const session = this.captureSession();
    await this.ensureDeviceSubscription(session);
    return this.reconcileDevice(await this.readSettings(session, true));
  }

  private async ensureDeviceSubscription(session: NotificationSession): Promise<PushSubscription> {
    let subscription = await this.currentSubscription();
    this.requireCurrent(session);
    if (!this.swPush.isEnabled) {
      throw new Error('Push notifications are not supported by this browser or PWA installation.');
    }
    const permission = await this.currentPermission();
    this.requireCurrent(session);
    if (permission === 'unavailable') {
      throw new Error('Push notifications are not supported by this browser or PWA installation.');
    }
    if (permission === 'denied') {
      throw new Error('Notifications are blocked. Allow them in the browser or site settings first.');
    }
    if (!subscription || permission !== 'granted') {
      try {
        subscription = await this.swPush.requestSubscription({
          serverPublicKey: environment.vapidPublicKey
        });
      } catch {
        this.requireCurrent(session);
        // Some browsers finish registration before resolving (or reject a
        // duplicate request). Reconcile the actual PushManager state before
        // reporting a failure to somebody who already granted access.
        subscription = await this.currentSubscription();
        this.requireCurrent(session);
        if (!subscription) {
          const refreshedPermission = await this.currentPermission();
          this.requireCurrent(session);
          if (refreshedPermission === 'denied') {
            throw new Error('Notifications are blocked. Allow them in the browser or site settings first.');
          }
          throw new Error(refreshedPermission === 'granted'
            ? 'Browser permission is enabled, but its push service could not register this device. Reopen the installed app and try again.'
            : 'Notification permission was not granted.');
        }
      }
    }
    this.requireCurrent(session);
    await this.registerDevice(session, subscription);
    return subscription;
  }

  private reconcileDevice(settings: PushNotificationSettings): PushNotificationSettings {
    if (settings.deviceSubscribed || settings.permission !== 'granted') return settings;
    // PushManager/SwPush may publish the new subscription one tick after
    // requestSubscription resolves. The returned subscription is already the
    // authoritative registration for this action, so keep the UI in sync
    // instead of briefly flipping the newly enabled toggle back off.
    return {
      ...settings,
      deviceSubscribed: true,
      deviceRegistered: true,
      registeredDeviceCount: Math.max(1, settings.registeredDeviceCount),
      deviceState: 'registered',
      active: settings.songLeagueEnabled,
      songAddedActive: settings.songLeagueSongAddedEnabled,
      statsAccessActive: settings.statsAccessRequestsEnabled
    };
  }

  private async currentSubscription(): Promise<PushSubscription | null> {
    if (!this.swPush.isEnabled) return null;
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      try {
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration && navigator.serviceWorker.controller) {
          registration = await navigator.serviceWorker.ready;
        }
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) return subscription;
      } catch {
        // Fall back to Angular's service-worker abstraction below.
      }
    }
    return await firstValueFrom(this.swPush.subscription);
  }

  private async registerDevice(session: NotificationSession, subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const endpoint = json.endpoint || subscription.endpoint;
    const p256dh = json.keys?.['p256dh'] || '';
    const auth = json.keys?.['auth'] || '';
    if (!endpoint || !p256dh || !auth) {
      throw new Error('The browser returned an incomplete push subscription.');
    }
    await this.request(session, 'upsert_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: typeof navigator === 'undefined' ? '' : navigator.userAgent
    });
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
    deviceRegistered: boolean,
    registeredDeviceCount: number,
    permission: NotificationPermission | 'unavailable'
  ): PushNotificationSettings {
    const deviceState = !this.swPush.isEnabled || permission === 'unavailable'
      ? 'unsupported'
      : permission === 'denied'
        ? 'denied'
        : permission !== 'granted'
          ? 'permission-required'
          : deviceSubscribed && deviceRegistered
            ? 'registered'
            : deviceSubscribed
              ? 'subscription-missing'
              : registeredDeviceCount > 0 ? 'server-only' : 'subscription-missing';
    return {
      supported: this.swPush.isEnabled,
      installedPwa: this.isInstalledPwa(),
      permission,
      deviceSubscribed,
      deviceRegistered,
      registeredDeviceCount,
      deviceState,
      songLeagueEnabled,
      songLeagueSongAddedEnabled,
      songLeagueMember,
      statsAccessRequestsEnabled,
      active: songLeagueEnabled && deviceSubscribed && deviceRegistered && permission === 'granted',
      songAddedActive: songLeagueSongAddedEnabled && deviceSubscribed && deviceRegistered && permission === 'granted',
      statsAccessActive: statsAccessRequestsEnabled && deviceSubscribed && deviceRegistered && permission === 'granted'
    };
  }

  private isInstalledPwa(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
      || !!(window.navigator as Navigator & {standalone?: boolean}).standalone;
  }
}
