import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {CompareSaveResult, CompareTrack} from '@core/compare-room/compare-room.models';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {PlaylistShare, PlaylistShareDownload, SharedPlaylistStats} from '@core/sharing/playlist-sharing.models';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

@Component({
  selector: 'app-shared-playlist-detail',
  templateUrl: './shared-playlist-detail.component.html',
  styleUrls: ['./shared-playlist-detail.component.scss']
})
export class SharedPlaylistDetailComponent implements OnInit {
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
  saveResult: CompareSaveResult | null = null;
  viewerRole: 'owner' | 'recipient' = 'recipient';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: SpotifyAuthService,
    private sharing: PlaylistSharingService,
    private spotify: ParticipantSpotifyService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      const shareId = this.route.snapshot.paramMap.get('id') || '';
      const details = await this.sharing.loadShare(shareId);
      this.share = details.share;
      this.tracks = details.tracks;
      this.download = details.download;
      this.viewerRole = details.viewerRole;
      this.stats = this.sharing.calculateStats(this.tracks);
      this.filterTracks();
    } catch (error) {
      this.share = null;
      this.errorMessage = (error as any)?.message || 'This shared playlist is unavailable or has been revoked.';
    } finally {
      this.isLoading = false;
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
        this.share.playlistName,
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
