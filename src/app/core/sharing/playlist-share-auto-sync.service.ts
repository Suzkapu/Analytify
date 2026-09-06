import {Injectable} from '@angular/core';
import {firstValueFrom, Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {PlaylistSharingService} from './playlist-sharing.service';
import {sharedPlaylistSpotifyName} from './playlist-sharing-names';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';

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
    private sharing: PlaylistSharingService,
    private spotify: ParticipantSpotifyService,
    private sessionLifecycle: SessionLifecycleService
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
    return this.requestSync();
  }

  private requestSync(): Promise<void> {
    if (this.syncPromise) {
      this.syncRequested = true;
      return this.syncPromise;
    }
    const generation = this.sessionLifecycle.capture();
    this.syncPromise = this.sessionLifecycle.track(this.performPendingSyncs(generation), generation).finally(() => {
      this.lastSyncAt = Date.now();
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async performPendingSyncs(generation: SessionGeneration): Promise<void> {
    do {
      this.syncRequested = false;
      await this.performSync(generation);
    } while (this.syncRequested && this.sessionLifecycle.isCurrent(generation));
  }

  private async performSync(generation: SessionGeneration): Promise<void> {
    if (!this.sessionLifecycle.isCurrent(generation)) return;
    if (!this.auth.isAuthenticated() || !this.auth.getSupabaseUserId()) return;
    await this.auth.ensureInitialSync();
    if (!this.sessionLifecycle.isCurrent(generation)) return;
    if (!this.auth.getSupabaseUserId()) return;
    await this.syncReceivedSpotifyCopies(generation);
  }

  private async syncReceivedSpotifyCopies(generation: SessionGeneration): Promise<void> {
    const [receivedShares, downloads] = await Promise.all([
      this.sharing.listReceivedShares(),
      this.sharing.listReceivedDownloads()
    ]);
    if (!this.sessionLifecycle.isCurrent(generation)) return;
    if (receivedShares.length === 0 || downloads.length === 0) return;

    const downloadByShareId = new Map(downloads.map(download => [download.shareId, download]));
    let accessToken = '';
    for (const share of receivedShares) {
      const download = downloadByShareId.get(share.id);
      if (!download || download.appliedRevision >= share.revision || share.revokedAt) continue;

      let leaseToken: string | null = null;
      try {
        const details = await this.sharing.loadShare(share.id);
        if (!this.sessionLifecycle.isCurrent(generation)) return;
        if (!details.download || details.download.appliedRevision >= details.share.revision) continue;
        leaseToken = await this.sharing.claimDownloadSync(
          details.share.id,
          details.share.revision,
          details.download.appliedRevision
        );
        if (!leaseToken) continue;
        if (!this.sessionLifecycle.isCurrent(generation)) {
          await this.sharing.releaseDownloadSync(share.id, leaseToken);
          return;
        }
        if (!accessToken) accessToken = await this.getUsableAccessToken();
        const description = `Shared by ${details.share.ownerDisplayName} through Analytify. Share ID: ${details.share.id}`.slice(0, 300);
        const result = await this.spotify.syncPlaylist(
          accessToken,
          details.download.spotifyPlaylistId,
          details.download.spotifyPlaylistUrl,
          sharedPlaylistSpotifyName(details.share.playlistName, details.share.ownerDisplayName),
          description,
          details.tracks,
          generation.signal
        );
        if (!this.sessionLifecycle.isCurrent(generation)) {
          await this.sharing.releaseDownloadSync(share.id, leaseToken);
          return;
        }
        if (!result.success || !result.playlistId) {
          throw new Error(result.error || 'Spotify could not update the downloaded playlist.');
        }
        const completed = await this.sharing.completeDownloadSync(
          details.share.id,
          details.share.revision,
          details.download.appliedRevision,
          leaseToken,
          result.playlistId,
          result.playlistUrl || details.download.spotifyPlaylistUrl
        );
        if (!completed) throw new Error('This share changed while its Spotify copy was updating.');
        this.spotifyUpdatesSubject.next({
          shareId: details.share.id,
          revision: details.share.revision,
          success: true
        });
      } catch (error) {
        if (leaseToken) {
          await this.sharing.releaseDownloadSync(share.id, leaseToken).catch(releaseError => {
            console.warn('[PlaylistShareAutoSync] Could not release playlist sync lease.', releaseError);
          });
        }
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
    void this.requestSync().catch(error => {
      console.warn('[PlaylistShareAutoSync] Automatic recipient update failed.', error);
    });
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
