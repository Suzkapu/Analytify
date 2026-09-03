import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {firstValueFrom, Subscription} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {CompareSaveResult, CompareTrack} from '@core/compare-room/compare-room.models';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {PlaylistShare, PlaylistShareDownload, SharedPlaylistStats} from '@core/sharing/playlist-sharing.models';
import {sharedPlaylistName, sharedPlaylistSpotifyName} from '@core/sharing/playlist-sharing-names';
import {PlaylistShareAutoSyncService, PlaylistShareSpotifyUpdate} from '@core/sharing/playlist-share-auto-sync.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

@Component({
  selector: 'app-shared-playlist-detail',
  templateUrl: './shared-playlist-detail.component.html',
  styleUrls: ['./shared-playlist-detail.component.scss']
})
export class SharedPlaylistDetailComponent implements OnInit, OnDestroy {
  share: PlaylistShare | null = null;
  tracks: CompareTrack[] = [];
  filteredTracks: CompareTrack[] = [];
  download: PlaylistShareDownload | null = null;
  stats: SharedPlaylistStats | null = null;
  searchText = '';
  activeView: 'songs' | 'stats' = 'songs';
  isLoading = true;
  isDownloading = false;
  errorMessage = '';
  liveUpdateMessage = '';
  saveResult: CompareSaveResult | null = null;
  viewerRole: 'owner' | 'recipient' = 'recipient';

  private shareId = '';
  private unsubscribeShareChanges: (() => void) | null = null;
  private spotifyUpdateSubscription = new Subscription();
  private isLiveReloading = false;
  private liveReloadPending = false;
  private destroyed = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: SpotifyAuthService,
    private sharing: PlaylistSharingService,
    private spotify: ParticipantSpotifyService,
    private shareAutoSync: PlaylistShareAutoSyncService
  ) {}

  async ngOnInit(): Promise<void> {
    this.destroyed = false;
    this.shareId = this.route.snapshot.paramMap.get('id') || '';
    this.spotifyUpdateSubscription = this.shareAutoSync.spotifyUpdates$.subscribe(update => {
      if (update.shareId === this.shareId) void this.applySpotifyAutoUpdate(update);
    });
    await this.load();
    if (this.destroyed) return;
    if (this.shareId) {
      this.unsubscribeShareChanges = this.sharing.subscribeToShareChanges(
        () => void this.reloadFromLiveUpdate(),
        this.shareId
      );
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unsubscribeShareChanges?.();
    this.unsubscribeShareChanges = null;
    this.spotifyUpdateSubscription.unsubscribe();
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.isLoading = true;
    this.errorMessage = '';
    try {
      const shareId = this.shareId || this.route.snapshot.paramMap.get('id') || '';
      const details = await this.sharing.loadShare(shareId);
      this.share = details.share;
      this.tracks = details.tracks;
      this.download = this.newerDownload(this.download, details.download);
      this.viewerRole = details.viewerRole;
      this.stats = this.sharing.calculateStats(this.tracks);
      this.filterTracks();
    } catch (error) {
      this.share = null;
      this.errorMessage = (error as any)?.message || 'This shared playlist is unavailable or has been revoked.';
    } finally {
      if (!silent) this.isLoading = false;
    }
  }

  filterTracks(): void {
    const query = this.searchText.trim().toLowerCase();
    this.filteredTracks = !query
      ? [...this.tracks]
      : this.tracks.filter(track =>
          track.name.toLowerCase().includes(query)
          || track.artists.some(artist => artist.name.toLowerCase().includes(query))
          || track.albumName.toLowerCase().includes(query)
        );
  }

  async downloadOrUpdate(): Promise<void> {
    if (!this.share || !this.isRecipient || this.isDownloading) return;
    this.isDownloading = true;
    this.errorMessage = '';
    this.saveResult = null;
    try {
      const accessToken = await this.getUsableAccessToken();
      const description = `Shared by ${this.share.ownerDisplayName} through Analytify. Share ID: ${this.share.id}`.slice(0, 300);
      const result = await this.spotify.syncPlaylist(
        accessToken,
        this.download?.spotifyPlaylistId || null,
        this.download?.spotifyPlaylistUrl || null,
        sharedPlaylistSpotifyName(this.share.playlistName, this.share.ownerDisplayName),
        description,
        this.tracks
      );
      this.saveResult = result;
      if (result.playlistId) {
        await this.sharing.recordDownload(
          this.share.id,
          result.playlistId,
          result.playlistUrl || '',
          result.success ? this.share.revision : (this.download?.appliedRevision || 0)
        );
      }
      if (!result.success) throw new Error(result.error || 'Spotify could not finish updating the playlist.');
      this.download = {
        shareId: this.share.id,
        spotifyPlaylistId: result.playlistId || '',
        spotifyPlaylistUrl: result.playlistUrl || '',
        appliedRevision: this.share.revision,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'The Spotify playlist could not be updated.';
    } finally {
      this.isDownloading = false;
    }
  }

  back(): void {
    void this.router.navigate(['/shared-playlists']);
  }

  get isRecipient(): boolean {
    return this.viewerRole === 'recipient';
  }

  get hasUpdate(): boolean {
    return !!this.share && !!this.download && this.download.appliedRevision < this.share.revision;
  }

  get downloadButtonLabel(): string {
    if (!this.download) return 'Add to my Spotify';
    if (this.hasUpdate) return 'Update my Spotify copy';
    return 'Spotify copy is up to date';
  }

  get displayPlaylistName(): string {
    if (!this.share) return 'Shared Playlist';
    return this.isRecipient
      ? sharedPlaylistName(this.share.playlistName, this.share.ownerDisplayName)
      : this.share.playlistName;
  }

  formatDuration(durationMs: number): string {
    if (!durationMs) return '—';
    const minutes = Math.round(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours > 0 ? `${hours}h ${remainder}m` : `${minutes}m`;
  }

  trackTrack(_: number, track: CompareTrack): string {
    return track.id;
  }

  private async reloadFromLiveUpdate(): Promise<void> {
    if (this.isLiveReloading) {
      this.liveReloadPending = true;
      return;
    }

    this.isLiveReloading = true;
    try {
      do {
        this.liveReloadPending = false;
        const previousRevision = this.share?.revision || 0;
        await this.load(true);
        const currentRevision = this.share?.revision || 0;
        if (previousRevision > 0 && currentRevision > previousRevision) {
          this.saveResult = null;
          this.liveUpdateMessage = this.download?.appliedRevision === currentRevision
            ? `Your Spotify copy was automatically updated to revision ${currentRevision}.`
            : this.download
              ? `Live update received: revision ${currentRevision} is being applied to your Spotify copy…`
            : `Live update received: revision ${currentRevision} is now available.`;
        }
      } while (this.liveReloadPending);
    } finally {
      this.isLiveReloading = false;
    }
  }

  private async applySpotifyAutoUpdate(update: PlaylistShareSpotifyUpdate): Promise<void> {
    if (update.success) {
      await this.load(true);
      this.liveUpdateMessage = `Your Spotify copy was automatically updated to revision ${update.revision}.`;
      return;
    }
    this.errorMessage = `${update.error || 'The automatic Spotify update failed.'} You can retry it below.`;
  }

  private newerDownload(
    current: PlaylistShareDownload | null,
    incoming: PlaylistShareDownload | null
  ): PlaylistShareDownload | null {
    if (!incoming) return current;
    if (!current || current.shareId !== incoming.shareId) return incoming;
    return current.appliedRevision > incoming.appliedRevision ? current : incoming;
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
