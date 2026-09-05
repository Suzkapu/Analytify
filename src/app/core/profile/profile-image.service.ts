import {Injectable} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

export interface ProfileImageMetadata {
  url: string;
  source: 'spotify' | 'supabase';
  cachedAt: number;
  expiresAt: number | null;
  failureCount: number;
  lastFailureAt: number | null;
  lastFailureStatus?: number | 'offline' | 'timeout';
  isPermanentlyAbsent?: boolean;
}

export interface ImageProbeResult {
  ok: boolean;
  status: number;
  isOffline?: boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown after max retries
const MAX_RETRIES = 3;

@Injectable({
  providedIn: 'root'
})
export class ProfileImageService {
  readonly maxRetries = MAX_RETRIES;
  readonly cooldownMs = DEFAULT_COOLDOWN_MS;
  readonly defaultTtlMs = DEFAULT_TTL_MS;

  // Pluggable probe implementation for deterministic testing and browser probing
  probeUrl: (url: string) => Promise<ImageProbeResult> = async (url: string) => {
    if (this.isOffline()) {
      return {ok: false, status: 0, isOffline: true};
    }
    try {
      if (typeof fetch !== 'undefined') {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;
        try {
          const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller?.signal
          });
          if (timeoutId) clearTimeout(timeoutId);
          // no-cors mode returns type 'opaque' with status 0, which means network fetch succeeded
          return {ok: true, status: response.status || 200};
        } catch (fetchError: any) {
          if (timeoutId) clearTimeout(timeoutId);
          if (fetchError?.name === 'AbortError') {
            return {ok: false, status: 504};
          }
          return {ok: false, status: 500};
        }
      }
      return {ok: true, status: 200};
    } catch {
      return {ok: false, status: 500};
    }
  };

  constructor(
    private storageService: StorageService,
    private spotifyDataService: SpotifyDataService,
    private supabaseService: SupabaseService
  ) {}

  isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /**
   * Extracts expiration timestamp in milliseconds from signed URL parameters (e.g. Facebook oe, CloudFront Expires).
   */
  extractUrlExpiry(url: string): number | null {
    if (!url) return null;
    try {
      // Facebook CDN platform-lookaside hex timestamp
      const oeMatch = url.match(/[?&]oe=([0-9a-fA-F]+)/);
      if (oeMatch && oeMatch[1]) {
        const seconds = parseInt(oeMatch[1], 16);
        if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
      }

      // AWS S3 / CloudFront decimal timestamp
      const expMatch = url.match(/[?&]Expires=([0-9]+)/);
      if (expMatch && expMatch[1]) {
        const seconds = parseInt(expMatch[1], 10);
        if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
      }

      // ISO timestamp (e.g. Azure SAS se param)
      const seMatch = url.match(/[?&]se=([^&]+)/);
      if (seMatch && seMatch[1]) {
        const parsed = Date.parse(decodeURIComponent(seMatch[1]));
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    } catch {
      // Ignore URL parsing errors
    }
    return null;
  }

  /**
   * Checks whether the given cached URL has expired.
   */
  isUrlExpired(url: string, cachedAt?: number, expiresAt?: number | null): boolean {
    const now = Date.now();
    if (expiresAt !== undefined && expiresAt !== null) {
      return now >= expiresAt;
    }
    const extracted = this.extractUrlExpiry(url);
    if (extracted !== null) {
      return now >= extracted;
    }
    if (cachedAt) {
      return now - cachedAt > this.defaultTtlMs;
    }
    return false;
  }

  getMetadata(userId: string): ProfileImageMetadata | null {
    const raw = this.storageService.getItem(`${userId}_profile_pic_meta`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ProfileImageMetadata;
    } catch {
      return null;
    }
  }

  saveMetadata(userId: string, metadata: ProfileImageMetadata): void {
    this.storageService.setItem(`${userId}_profile_pic_meta`, JSON.stringify(metadata), false);
  }

  removeMetadata(userId: string): void {
    this.storageService.removeItem(`${userId}_profile_pic_meta`);
  }

  saveProfileImage(userId: string, url: string, source: 'spotify' | 'supabase'): void {
    const now = Date.now();
    const expiresAt = this.extractUrlExpiry(url) || (now + this.defaultTtlMs);
    this.storageService.setItem(`${userId}_profile_pic`, url);
    this.saveMetadata(userId, {
      url,
      source,
      cachedAt: now,
      expiresAt,
      failureCount: 0,
      lastFailureAt: null
    });
  }

  setPermanentlyAbsent(userId: string): void {
    this.storageService.removeItem(`${userId}_profile_pic`);
    this.saveMetadata(userId, {
      url: '',
      source: 'spotify',
      cachedAt: Date.now(),
      expiresAt: null,
      failureCount: 0,
      lastFailureAt: null,
      isPermanentlyAbsent: true
    });
  }

  recordTransientFailure(userId: string, failedUrl: string, status: number | 'offline' | 'timeout'): ProfileImageMetadata {
    const existing = this.getMetadata(userId);
    const now = Date.now();
    const failureCount = (existing?.failureCount || 0) + 1;
    const metadata: ProfileImageMetadata = {
      url: failedUrl,
      source: existing?.source || 'spotify',
      cachedAt: existing?.cachedAt || now,
      expiresAt: existing?.expiresAt || null,
      failureCount,
      lastFailureAt: now,
      lastFailureStatus: status
    };
    this.saveMetadata(userId, metadata);
    return metadata;
  }

  /**
   * Loads the user profile image, prioritizing fresh cache and falling back to Supabase and Spotify.
   */
  async loadProfileImage(userId: string, supabaseUserId?: string | null): Promise<string | null> {
    const cached = this.storageService.getItem(`${userId}_profile_pic`);
    const meta = this.getMetadata(userId);

    // If marked as permanently absent, do not attempt re-fetching unless cache is manually invalidated
    if (meta?.isPermanentlyAbsent) {
      return null;
    }

    // If in retry cooldown due to consecutive failures, provide quiet fallback
    if (meta && meta.failureCount >= this.maxRetries && meta.lastFailureAt && Date.now() - meta.lastFailureAt < this.cooldownMs) {
      return null;
    }

    // Check existing cached URL
    if (cached) {
      // If URL has expired, proactively refresh from Spotify
      if (this.isUrlExpired(cached, meta?.cachedAt, meta?.expiresAt)) {
        return this.refreshFromProvider(userId);
      }

      return cached;
    }

    // Check Supabase if available
    if (supabaseUserId) {
      try {
        const dbProfile = await this.supabaseService.loadUserProfile(supabaseUserId);
        if (dbProfile?.profile_pic_url) {
          this.saveProfileImage(userId, dbProfile.profile_pic_url, 'supabase');
          return dbProfile.profile_pic_url;
        }
      } catch {
        // Fall through to Spotify
      }
    }

    // Load from Spotify
    return this.refreshFromProvider(userId);
  }

  /**
   * Refreshes the user profile image from Spotify.
   */
  async refreshFromProvider(userId: string): Promise<string | null> {
    try {
      const user = await firstValueFrom(this.spotifyDataService.getCurrentUser());
      const pic = user?.images && user.images[0] ? user.images[0].url : '';
      if (user?.id) {
        this.storageService.setItem(`${userId}_spotify_profile_id`, user.id, false);
        this.storageService.setItem(`${userId}_spotify_profile_id_verified`, 'true', false);
      }
      if (pic) {
        this.saveProfileImage(userId, pic, 'spotify');
        return pic;
      } else {
        this.setPermanentlyAbsent(userId);
        return null;
      }
    } catch (error) {
      // If offline or network error, do not mark as permanently absent
      if (this.isOffline()) {
        return null;
      }
      return null;
    }
  }

  /**
   * Handles an image loading failure in the browser.
   * Distinguishes 5xx/timeout/offline from 404/expired and retries with bounded backoff.
   */
  async handleImageError(failedUrl: string | null, userId: string): Promise<string | null> {
    if (!failedUrl) {
      return null;
    }

    // 1. Offline check: do not penalize retry count or mark absent
    if (this.isOffline()) {
      this.recordTransientFailure(userId, failedUrl, 'offline');
      return null;
    }

    // 2. Check if URL is expired based on parameter timestamps
    if (this.isUrlExpired(failedUrl)) {
      const refreshed = await this.refreshFromProvider(userId);
      if (refreshed && refreshed !== failedUrl) {
        return refreshed;
      }
    }

    // 3. Probe the failed URL to determine failure mode (504 vs 404 vs offline)
    const probe = await this.probeUrl(failedUrl);

    if (probe.isOffline) {
      this.recordTransientFailure(userId, failedUrl, 'offline');
      return null;
    }

    if (probe.status === 404 || probe.status === 410) {
      // Resource is gone; attempt provider refresh
      const refreshed = await this.refreshFromProvider(userId);
      if (refreshed && refreshed !== failedUrl) {
        return refreshed;
      }
      // If provider also has no images, mark as permanently absent
      this.setPermanentlyAbsent(userId);
      return null;
    }

    if (probe.status === 504 || (probe.status >= 500 && probe.status <= 599)) {
      // Transient 5xx / gateway timeout error!
      const meta = this.recordTransientFailure(userId, failedUrl, probe.status);

      // If retry limit exceeded, stop retrying and keep quiet fallback
      if (meta.failureCount > this.maxRetries) {
        return null;
      }

      // Retry transient error with bounded backoff
      return this.retryTransientLoad(userId, failedUrl, meta.failureCount);
    }

    // Default: try refreshing from provider if possible
    const refreshed = await this.refreshFromProvider(userId);
    if (refreshed && refreshed !== failedUrl) {
      return refreshed;
    }

    return null;
  }

  /**
   * Retries a transient load with bounded backoff.
   */
  async retryTransientLoad(userId: string, failedUrl: string, attempt: number): Promise<string | null> {
    const backoffMs = Math.min(100 * Math.pow(2, attempt - 1), 1000);
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    if (this.isOffline()) {
      return null;
    }

    const probe = await this.probeUrl(failedUrl);
    if (probe.ok && (probe.status === 200 || probe.status === 0)) {
      // 504 -> success! Restore profile pic
      this.saveProfileImage(userId, failedUrl, 'spotify');
      return failedUrl;
    }

    return null;
  }
}
