import {Component, OnInit} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ComparePlaylist} from '@core/compare-room/compare-room.models';
import {PlaylistShare, PlaylistSharePublication} from '@core/sharing/playlist-sharing.models';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

@Component({
  selector: 'app-shared-playlists',
  templateUrl: './shared-playlists.component.html',
  styleUrls: ['./shared-playlists.component.scss']
})
export class SharedPlaylistsComponent implements OnInit {
  receivedShares: PlaylistShare[] = [];
  ownedShares: PlaylistShare[] = [];
  isLoading = true;
  busyShareId = '';
  errorMessage = '';
  successMessage = '';

  constructor(
    private sharing: PlaylistSharingService,
    private auth: SpotifyAuthService,
    private source: ComparePlaylistSourceService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      [this.receivedShares, this.ownedShares] = await Promise.all([
        this.sharing.listReceivedShares(),
        this.sharing.listOwnedShares()
      ]);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.isLoading = false;
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
      await this.reload();
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
      await this.reload();
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.busyShareId = '';
    }
  }

  trackShare(_: number, share: PlaylistShare): string {
    return share.id;
  }

  private playlistFromShare(share: PlaylistShare): ComparePlaylist {
    return {
      id: share.sourcePlaylistId,
      name: share.playlistName,
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
