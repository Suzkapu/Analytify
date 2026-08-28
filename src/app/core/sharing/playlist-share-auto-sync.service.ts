import {Injectable} from '@angular/core';
import {firstValueFrom, Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistSharingService} from './playlist-sharing.service';
import {sharedPlaylistSpotifyName} from './playlist-sharing-names';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Playlist Share Sync');

export interface PlaylistShareSpotifyUpdate {
  shareId: string;
  revision: number;
  success: boolean;
  error?: string;
}

@Injectable({providedIn: 'root'})
export class PlaylistShareAutoSyncService {
  private started = false;
  private syncPromise: Promise<void> | null = null;
  private syncRequested = false;
  private includeOwnerOnNextSync = false;
  private lastSyncAt = 0;
  private unsubscribeShareChanges: (() => void) | null = null;
  private readonly spotifyUpdatesSubject = new Subject<PlaylistShareSpotifyUpdate>();
  readonly spotifyUpdates$ = this.spotifyUpdatesSubject.asObservable();
  private readonly visibilityHandler = () => {
    if (document.visibilityState === 'visible' && Date.now() - this.lastSyncAt >= 60_000) {
      this.runInBackground();
    }
  };

  constructor(
    private auth: SpotifyAuthService,
    private storage: StorageService,
    private sharing: PlaylistSharingService,
    private spotify: ParticipantSpotifyService
  ) {
    this.auth.logout$.subscribe(() => this.stop());
  }

  start(): void {
    // Shared playlists are a cloud feature. Local-only Spotify sessions must
    // not open a realtime channel or issue Supabase share queries.
    if (this.started || !this.auth.getSupabaseUserId()) return;
    this.started = true;
    this.unsubscribeShareChanges = this.sharing.subscribeToShareChanges(() => this.runRecipientSyncInBackground());
    this.runInBackground();
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  stop(): void {
    this.started = false;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.unsubscribeShareChanges?.();
    this.unsubscribeShareChanges = null;
  }

  syncNow(): Promise<void> {
    return this.requestSync(true);
  }

  private requestSync(includeOwner: boolean): Promise<void> {
    if (this.syncPromise) {
      this.syncRequested = true;
      this.includeOwnerOnNextSync = this.includeOwnerOnNextSync || includeOwner;
      return this.syncPromise;
    }
    this.includeOwnerOnNextSync = includeOwner;
    this.syncPromise = this.performPendingSyncs().finally(() => {
      this.lastSyncAt = Date.now();
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async performPendingSyncs(): Promise<void> {
    do {
      this.syncRequested = false;
      const includeOwner = this.includeOwnerOnNextSync;
      this.includeOwnerOnNextSync = false;
      await this.performSync(includeOwner);
    } while (this.syncRequested);
  }

  private async performSync(includeOwner: boolean): Promise<void> {
    if (!this.auth.isAuthenticated() || !this.auth.getSupabaseUserId()) return;
    await this.auth.ensureInitialSync();
    if (!this.auth.getSupabaseUserId()) return;
    if (includeOwner && this.auth.isBackupActive()) {
      try {
        await this.syncOwnedSharesFromCache();
      } catch (error) {
        console.warn('[PlaylistShareAutoSync] Owner snapshots could not be published.', error);
      }
    }
    await this.syncReceivedSpotifyCopies();
  }

  private async syncOwnedSharesFromCache(): Promise<void> {
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

  private async syncReceivedSpotifyCopies(): Promise<void> {
    const [receivedShares, downloads] = await Promise.all([
      this.sharing.listReceivedShares(),
      this.sharing.listReceivedDownloads()
    ]);
    if (receivedShares.length === 0 || downloads.length === 0) return;

    const downloadByShareId = new Map(downloads.map(download => [download.shareId, download]));
    let accessToken = '';
    for (const share of receivedShares) {
      const download = downloadByShareId.get(share.id);
      if (!download || download.appliedRevision >= share.revision || share.revokedAt) continue;

      try {
        const details = await this.sharing.loadShare(share.id);
        if (!details.download || details.download.appliedRevision >= details.share.revision) continue;
        if (!accessToken) accessToken = await this.getUsableAccessToken();
        const description = `Shared by ${details.share.ownerDisplayName} through Analytify. Share ID: ${details.share.id}`.slice(0, 300);
        const result = await this.spotify.syncPlaylist(
          accessToken,
          details.download.spotifyPlaylistId,
          details.download.spotifyPlaylistUrl,
          sharedPlaylistSpotifyName(details.share.playlistName, details.share.ownerDisplayName),
          description,
          details.tracks
        );
        if (!result.success || !result.playlistId) {
          throw new Error(result.error || 'Spotify could not update the downloaded playlist.');
        }
        await this.sharing.recordDownload(
          details.share.id,
          result.playlistId,
          result.playlistUrl || details.download.spotifyPlaylistUrl,
          details.share.revision
        );
        this.spotifyUpdatesSubject.next({
          shareId: details.share.id,
          revision: details.share.revision,
          success: true
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Spotify could not update the downloaded playlist.';
        console.warn(`[PlaylistShareAutoSync] Could not update Spotify copy for “${share.playlistName}”.`, error);
        this.spotifyUpdatesSubject.next({
          shareId: share.id,
          revision: share.revision,
          success: false,
          error: message
        });
      }
    }
  }

  private runInBackground(): void {
    void this.syncNow().catch(error => {
      console.warn('[PlaylistShareAutoSync] Automatic publication failed.', error);
    });
  }

  private runRecipientSyncInBackground(): void {
    void this.requestSync(false).catch(error => {
      console.warn('[PlaylistShareAutoSync] Automatic recipient update failed.', error);
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

  private async getUsableAccessToken(): Promise<string> {
    let accessToken = this.auth.getAccessToken();
    if (this.auth.isTokenExpired()) {
      const refreshed = await firstValueFrom(this.auth.refreshToken());
      accessToken = refreshed?.access_token || this.auth.getAccessToken();
    }
    if (!accessToken) throw new Error('Your Spotify session is unavailable.');
    return accessToken;
  }
}
