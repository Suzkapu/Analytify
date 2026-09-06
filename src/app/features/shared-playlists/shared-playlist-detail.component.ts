import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {distinctUntilChanged, firstValueFrom, map, Subscription} from 'rxjs';
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
  isTracksLoading = false;
  trackLoadError = '';
  readonly virtualRowHeight = 62;
  readonly virtualWindowSize = 120;
  visibleTrackStart = 0;
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
  private loadGeneration = 0;
  private routeSubscription = new Subscription();
  private trackLoadController: AbortController | null = null;
  private artistCounts = new Map<string, {id: string; name: string; count: number}>();
  private albumCounts = new Map<string, number>();
  private totalDurationMs = 0;
  private explicitTrackCount = 0;

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
    this.spotifyUpdateSubscription = this.shareAutoSync.spotifyUpdates$.subscribe(update => {
      if (update.shareId === this.shareId) void this.applySpotifyAutoUpdate(update);
    });
    if (this.route.paramMap) {
      this.routeSubscription = this.route.paramMap.pipe(
        map(params => params.get('id') || ''),
        distinctUntilChanged()
      ).subscribe(shareId => void this.activateShareRoute(shareId));
    } else {
      await this.activateShareRoute(this.route.snapshot.paramMap.get('id') || '');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadGeneration++;
    this.routeSubscription.unsubscribe();
    this.trackLoadController?.abort();
    this.trackLoadController = null;
    this.unsubscribeShareChanges?.();
    this.unsubscribeShareChanges = null;
    this.spotifyUpdateSubscription.unsubscribe();
  }

  async load(
    silent = false,
    shareId = this.shareId || this.route.snapshot.paramMap.get('id') || '',
    generation = this.loadGeneration
  ): Promise<void> {
    if (!this.shareId && shareId) this.shareId = shareId;
    const canApply = () => !this.destroyed
      && this.shareId === shareId
      && this.loadGeneration === generation;
    if (!canApply()) return;
    if (!silent) this.isLoading = true;
    this.errorMessage = '';
    this.trackLoadError = '';
    this.trackLoadController?.abort();
    const controller = new AbortController();
    this.trackLoadController = controller;
    try {
      const details = await this.sharing.loadShareMetadata(shareId);
      if (!canApply()) return;
      this.share = details.share;
      this.download = this.newerDownload(this.download, details.download);
      this.viewerRole = details.viewerRole;
      this.isLoading = false;
      this.resetTrackView();
      this.isTracksLoading = true;
      try {
        const tracks = await this.sharing.loadShareTracks(shareId, {
          signal: controller.signal,
          concurrency: 3,
          onPage: page => {
            if (!canApply() || controller.signal.aborted) return;
            this.appendTrackPage(page);
          }
        });
        if (!canApply() || controller.signal.aborted) return;
        this.tracks = tracks;
        this.filterTracks(false);
      } catch (error) {
        if (!canApply() || controller.signal.aborted || (error as any)?.name === 'AbortError') return;
        this.trackLoadError = (error as any)?.message || 'Some songs could not be loaded. Please retry.';
      } finally {
        if (canApply() && !controller.signal.aborted) this.isTracksLoading = false;
      }
    } catch (error) {
      if (!canApply()) return;
      this.share = null;
      this.errorMessage = (error as any)?.message || 'This shared playlist is unavailable or has been revoked.';
    } finally {
      if (!silent && canApply()) this.isLoading = false;
    }
  }

  filterTracks(resetWindow = true): void {
    const query = this.searchText.trim().toLowerCase();
    this.filteredTracks = !query
      ? [...this.tracks]
      : this.tracks.filter(track =>
          track.name.toLowerCase().includes(query)
          || track.artists.some(artist => artist.name.toLowerCase().includes(query))
          || track.albumName.toLowerCase().includes(query)
        );
    if (resetWindow) this.visibleTrackStart = 0;
  }

  get visibleTracks(): CompareTrack[] {
    return this.filteredTracks.slice(this.visibleTrackStart, this.visibleTrackStart + this.virtualWindowSize);
  }

  get virtualTopPadding(): number {
    return this.visibleTrackStart * this.virtualRowHeight;
  }

  get virtualBottomPadding(): number {
    return Math.max(0, this.filteredTracks.length - this.visibleTrackStart - this.virtualWindowSize)
      * this.virtualRowHeight;
  }

  onTrackListScroll(event: Event): void {
    const scrollTop = (event.currentTarget as HTMLElement).scrollTop;
    const nextStart = Math.max(0, Math.floor(scrollTop / this.virtualRowHeight) - 10);
    const maximum = Math.max(0, this.filteredTracks.length - this.virtualWindowSize);
    this.visibleTrackStart = Math.min(nextStart, maximum);
  }

  async downloadOrUpdate(): Promise<void> {
    if (!this.share || !this.isRecipient || this.isDownloading || this.isTracksLoading || this.trackLoadError) return;
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
    const shareId = this.shareId;
    const generation = this.loadGeneration;
    if (this.isLiveReloading) {
      this.liveReloadPending = true;
      return;
    }

    this.isLiveReloading = true;
    try {
      do {
        this.liveReloadPending = false;
        const previousRevision = this.share?.revision || 0;
        await this.load(true, shareId, generation);
        if (shareId !== this.shareId || generation !== this.loadGeneration) return;
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
    const generation = this.loadGeneration;
    if (update.shareId !== this.shareId) return;
    if (update.success) {
      await this.load(true, update.shareId, generation);
      if (update.shareId !== this.shareId || generation !== this.loadGeneration) return;
      this.liveUpdateMessage = `Your Spotify copy was automatically updated to revision ${update.revision}.`;
      return;
    }
    this.errorMessage = `${update.error || 'The automatic Spotify update failed.'} You can retry it below.`;
  }

  private async activateShareRoute(shareId: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.trackLoadController?.abort();
    this.trackLoadController = null;
    this.unsubscribeShareChanges?.();
    this.unsubscribeShareChanges = null;
    this.shareId = shareId;
    this.share = null;
    this.tracks = [];
    this.filteredTracks = [];
    this.download = null;
    this.stats = null;
    this.isTracksLoading = false;
    this.trackLoadError = '';
    this.errorMessage = '';
    this.liveUpdateMessage = '';
    this.saveResult = null;
    this.isLiveReloading = false;
    this.liveReloadPending = false;
    await this.load(false, shareId, generation);
    if (this.destroyed || this.shareId !== shareId || this.loadGeneration !== generation || !shareId) return;
    this.unsubscribeShareChanges = this.sharing.subscribeToShareChanges(
      () => void this.reloadFromLiveUpdate(),
      shareId
    );
  }

  private newerDownload(
    current: PlaylistShareDownload | null,
    incoming: PlaylistShareDownload | null
  ): PlaylistShareDownload | null {
    if (!incoming) return current;
    if (!current || current.shareId !== incoming.shareId) return incoming;
    return current.appliedRevision > incoming.appliedRevision ? current : incoming;
  }

  private resetTrackView(): void {
    this.tracks = [];
    this.filteredTracks = [];
    this.visibleTrackStart = 0;
    this.artistCounts.clear();
    this.albumCounts.clear();
    this.totalDurationMs = 0;
    this.explicitTrackCount = 0;
    this.stats = this.currentStats();
  }

  private appendTrackPage(page: CompareTrack[]): void {
    this.tracks = [...this.tracks, ...page];
    page.forEach(track => {
      this.totalDurationMs += Number(track.durationMs || 0);
      if (track.explicit) this.explicitTrackCount++;
      track.artists.forEach(artist => {
        const current = this.artistCounts.get(artist.id) || {...artist, count: 0};
        current.count++;
        this.artistCounts.set(artist.id, current);
      });
      if (track.albumName) {
        this.albumCounts.set(track.albumName, (this.albumCounts.get(track.albumName) || 0) + 1);
      }
    });
    this.stats = this.currentStats();
    this.filterTracks(false);
  }

  private currentStats(): SharedPlaylistStats {
    return {
      tracks: this.tracks.length,
      artists: this.artistCounts.size,
      albums: this.albumCounts.size,
      durationMs: this.totalDurationMs,
      explicitTracks: this.explicitTrackCount,
      topArtists: Array.from(this.artistCounts.values()).sort((a, b) => b.count - a.count).slice(0, 10),
      topAlbums: Array.from(this.albumCounts.entries())
        .map(([name, count]) => ({name, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
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
