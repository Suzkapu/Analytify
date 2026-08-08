import {Injectable} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistSharingService} from './playlist-sharing.service';

@Injectable({providedIn: 'root'})
export class PlaylistShareAutoSyncService {
  private started = false;
  private syncPromise: Promise<void> | null = null;
  private lastSyncAt = 0;
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible' && Date.now() - this.lastSyncAt >= 60_000) {
      this.runInBackground();
    }
  };

  constructor(
    private auth: SpotifyAuthService,
    private storage: StorageService,
    private sharing: PlaylistSharingService
  ) {
    this.auth.logout$.subscribe(() => this.stop());
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.runInBackground();
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stop(): void {
    this.started = false;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  syncNow(): Promise<void> {
    if (!this.syncPromise) {
      this.syncPromise = this.performSync().finally(() => {
        this.lastSyncAt = Date.now();
        this.syncPromise = null;
      });
    }
    return this.syncPromise;
  }

  private async performSync(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    await this.auth.ensureInitialSync();
    if (!this.auth.isBackupActive()) return;

    const activeShares = (await this.sharing.listOwnedShares()).filter(share => !share.revokedAt);
    if (activeShares.length === 0) return;

    const spotifyUserId = this.auth.getUserId();
    if (!spotifyUserId) return;
    await this.storage.initFromDB();
    const firstShareBySource = new Map<string, typeof activeShares[number]>();
    activeShares.forEach(share => {
      if (!firstShareBySource.has(share.sourcePlaylistId)) {
        firstShareBySource.set(share.sourcePlaylistId, share);
      }
    });

    for (const share of firstShareBySource.values()) {
      const rawTracks = this.storage.getItem(`${spotifyUserId}_${share.sourcePlaylistId}`);
      if (!rawTracks) continue;
      try {
        const cachedArtists = JSON.parse(rawTracks);
        if (!Array.isArray(cachedArtists)) continue;
        const playlistName = this.readCachedName(spotifyUserId, share.sourcePlaylistId) || share.playlistName;
        await this.sharing.refreshActiveSharesFromCache(share.sourcePlaylistId, playlistName, cachedArtists);
      } catch (error) {
        console.warn(`[PlaylistShareAutoSync] Could not refresh “${share.playlistName}”.`, error);
      }
    }
  }

  private runInBackground(): void {
    void this.syncNow().catch(error => {
      console.warn('[PlaylistShareAutoSync] Automatic publication failed.', error);
    });
  }

  private readCachedName(userId: string, playlistId: string): string {
    const rawName = this.storage.getItem(`${userId}_${playlistId}_Name`);
    if (!rawName) return '';
    try {
      const parsed = JSON.parse(rawName);
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return rawName;
    }
  }
}
