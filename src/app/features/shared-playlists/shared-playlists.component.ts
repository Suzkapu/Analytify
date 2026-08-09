import {Component, OnDestroy, OnInit} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ComparePlaylist} from '@core/compare-room/compare-room.models';
import {PlaylistShare, PlaylistSharePublication} from '@core/sharing/playlist-sharing.models';
import {sharedPlaylistName} from '@core/sharing/playlist-sharing-names';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Shared Playlists');

@Component({
  selector: 'app-shared-playlists',
  templateUrl: './shared-playlists.component.html',
  styleUrls: ['./shared-playlists.component.scss']
})
export class SharedPlaylistsComponent implements OnInit, OnDestroy {
  receivedShares: PlaylistShare[] = [];
  ownedShares: PlaylistShare[] = [];
  availablePlaylists: ComparePlaylist[] = [];
  isLoading = true;
  busyShareId = '';
  errorMessage = '';
  successMessage = '';
  isShareDialogOpen = false;
  isLoadingSharePlaylists = false;
  isCreatingShare = false;
  selectedPlaylistId = '';
  shareLink = '';
  shareError = '';
  shareLinkCopied = false;

  private unsubscribeFromShareChanges: (() => void) | null = null;
  private silentReloadPromise: Promise<void> | null = null;

  constructor(
    private sharing: PlaylistSharingService,
    private auth: SpotifyAuthService,
    private source: ComparePlaylistSourceService
  ) {}

  async ngOnInit(): Promise<void> {
    this.unsubscribeFromShareChanges = this.sharing.subscribeToShareChanges(() => {
      this.reloadSilently();
    });
    await this.reload();
  }

  ngOnDestroy(): void {
    this.unsubscribeFromShareChanges?.();
    this.unsubscribeFromShareChanges = null;
  }

  async reload(silent = false): Promise<void> {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }
    try {
      [this.receivedShares, this.ownedShares] = await Promise.all([
        this.sharing.listReceivedShares(),
        this.sharing.listOwnedShares()
      ]);
    } catch (error) {
      if (silent) {
        console.warn('[SharedPlaylists] Could not apply a live share update.', error);
      } else {
        this.errorMessage = this.describeError(error);
      }
    } finally {
      if (!silent) this.isLoading = false;
    }
  }

  get canCreateShares(): boolean {
    return this.auth.isBackupActive();
  }

  get selectedPlaylist(): ComparePlaylist | null {
    return this.availablePlaylists.find(playlist => playlist.id === this.selectedPlaylistId) || null;
  }

  async openShareDialog(): Promise<void> {
    if (!this.canCreateShares) return;
    this.isShareDialogOpen = true;
    this.isLoadingSharePlaylists = true;
    this.availablePlaylists = [];
    this.selectedPlaylistId = '';
    this.shareLink = '';
    this.shareError = '';
    this.shareLinkCopied = false;
    try {
      const accessToken = await this.getUsableAccessToken();
      const spotifyUserId = this.auth.getUserId();
      if (!spotifyUserId) throw new Error('Your Spotify profile is unavailable.');
      this.availablePlaylists = await this.source.loadMainPlaylists(accessToken, spotifyUserId);
    } catch (error) {
      this.shareError = this.describeError(error);
    } finally {
      this.isLoadingSharePlaylists = false;
    }
  }

  closeShareDialog(): void {
    if (this.isCreatingShare) return;
    this.isShareDialogOpen = false;
    this.availablePlaylists = [];
    this.selectedPlaylistId = '';
    this.shareLink = '';
    this.shareError = '';
    this.shareLinkCopied = false;
  }

  async createShareLink(): Promise<void> {
    if (this.isCreatingShare) return;
    if (!this.canCreateShares) {
      this.shareError = 'Enable Cloud Backup before sharing a playlist.';
      return;
    }
    const playlist = this.selectedPlaylist;
    if (!playlist) {
      this.shareError = 'Select a playlist to share.';
      return;
    }

    this.isCreatingShare = true;
    this.shareError = '';
    try {
      const accessToken = await this.getUsableAccessToken();
      const spotifyUserId = this.auth.getUserId();
      if (!spotifyUserId) throw new Error('Your Spotify profile is unavailable.');
      const result = await this.source.loadMainTracks(playlist, accessToken, spotifyUserId);
      const created = await this.sharing.createShare({
        sourcePlaylistId: playlist.id,
        playlistName: playlist.name,
        playlistDescription: playlist.description || '',
        playlistImageUrl: playlist.imageUrl,
        tracks: result.tracks
      });
      this.shareLink = created.claimUrl;
      await this.reload(true);
    } catch (error) {
      this.shareError = this.describeError(error);
    } finally {
      this.isCreatingShare = false;
    }
  }

  async copyShareLink(): Promise<void> {
    if (!this.shareLink) return;
    try {
      await navigator.clipboard.writeText(this.shareLink);
      this.shareLinkCopied = true;
    } catch {
      this.shareError = 'Clipboard access is unavailable. Select and copy the link manually.';
    }
  }

  async refreshShare(share: PlaylistShare): Promise<void> {
    if (this.busyShareId) return;
    this.busyShareId = share.id;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      const accessToken = await this.getUsableAccessToken();
      const spotifyUserId = this.auth.getUserId();
      if (!spotifyUserId) throw new Error('Your Spotify profile is unavailable.');
      const sourcePlaylists = await this.source.loadMainPlaylists(accessToken, spotifyUserId);
      const playlist = sourcePlaylists.find(item => item.id === share.sourcePlaylistId)
        || this.playlistFromShare(share);
      const result = await this.source.loadMainTracks(playlist, accessToken, spotifyUserId);
      const publication: PlaylistSharePublication = {
        sourcePlaylistId: share.sourcePlaylistId,
        playlistName: playlist.name,
        playlistDescription: share.playlistDescription,
        playlistImageUrl: playlist.imageUrl || share.playlistImageUrl,
        tracks: result.tracks
      };
      const revision = await this.sharing.refreshShare(share.id, publication);
      this.successMessage = `“${playlist.name}” is published at revision ${revision}.`;
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.busyShareId = '';
    }
  }

  async revokeShare(share: PlaylistShare): Promise<void> {
    if (this.busyShareId) return;
    const recipient = share.recipientDisplayName || 'the recipient';
    if (!window.confirm(`Revoke ${recipient}’s access to “${share.playlistName}”? Their Spotify copy will remain but can no longer update.`)) {
      return;
    }
    this.busyShareId = share.id;
    this.errorMessage = '';
    try {
      await this.sharing.revokeShare(share.id);
      this.successMessage = `Access to “${share.playlistName}” was revoked.`;
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.busyShareId = '';
    }
  }

  trackShare(_: number, share: PlaylistShare): string {
    return share.id;
  }

  receivedPlaylistName(share: PlaylistShare): string {
    return sharedPlaylistName(share.playlistName, share.ownerDisplayName);
  }

  trackPlaylist(_: number, playlist: ComparePlaylist): string {
    return playlist.id;
  }

  private reloadSilently(): void {
    if (this.silentReloadPromise) return;
    this.silentReloadPromise = this.reload(true).finally(() => {
      this.silentReloadPromise = null;
    });
  }

  private playlistFromShare(share: PlaylistShare): ComparePlaylist {
    return {
      id: share.sourcePlaylistId,
      name: share.playlistName,
      description: share.playlistDescription,
      imageUrl: share.playlistImageUrl,
      total: share.trackCount,
      ownerName: share.ownerDisplayName,
      isLikedSongs: share.sourcePlaylistId === 'fav'
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

  private describeError(error: unknown): string {
    const value = error as any;
    return value?.message || value?.error_description || 'Shared playlists could not be loaded.';
  }
}
