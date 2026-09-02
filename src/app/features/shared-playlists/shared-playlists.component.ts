import {Component, OnDestroy, OnInit} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ComparePlaylist} from '@core/compare-room/compare-room.models';
import {PlaylistShare, PlaylistSharePublication} from '@core/sharing/playlist-sharing.models';
import {sharedPlaylistName} from '@core/sharing/playlist-sharing-names';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {StatsAccessRequest, StatsShareableUser} from '@core/sharing/stats-sharing.models';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
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
  shareMode: 'playlist' | 'stats' | null = null;
  availableStatsUsers: StatsShareableUser[] = [];
  statsAccessRequests: StatsAccessRequest[] = [];
  selectedStatsOwnerId = '';
  isLoadingStatsUsers = false;
  isRequestingStats = false;
  consentRequest: StatsAccessRequest | null = null;
  busyStatsRequestId = '';

  private unsubscribeFromShareChanges: (() => void) | null = null;
  private unsubscribeFromStatsChanges: (() => void) | null = null;
  private silentReloadPromise: Promise<void> | null = null;
  private dismissedConsentRequestIds = new Set<string>();

  constructor(
    private sharing: PlaylistSharingService,
    private auth: SpotifyAuthService,
    private source: ComparePlaylistSourceService,
    private statsSharing: StatsSharingService
  ) {}

  async ngOnInit(): Promise<void> {
    this.unsubscribeFromShareChanges = this.sharing.subscribeToShareChanges(() => {
      this.reloadSilently();
    });
    this.unsubscribeFromStatsChanges = this.statsSharing.subscribeToAccessChanges(() => {
      this.reloadSilently();
    });
    await this.reload();
  }

  ngOnDestroy(): void {
    this.unsubscribeFromShareChanges?.();
    this.unsubscribeFromShareChanges = null;
    this.unsubscribeFromStatsChanges?.();
    this.unsubscribeFromStatsChanges = null;
  }

  async reload(silent = false): Promise<void> {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }
    try {
      [this.receivedShares, this.ownedShares, this.statsAccessRequests] = await Promise.all([
        this.sharing.listReceivedShares(),
        this.sharing.listOwnedShares(),
        this.statsSharing.listAccessRequests()
      ]);
      this.selectNextConsentRequest();
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

  get selectedStatsOwner(): StatsShareableUser | null {
    return this.availableStatsUsers.find(user => user.userId === this.selectedStatsOwnerId) || null;
  }

  get approvedStatsAccess(): StatsAccessRequest[] {
    return this.statsAccessRequests.filter(request => request.viewerRole === 'viewer' && request.status === 'approved');
  }

  get sentStatsRequests(): StatsAccessRequest[] {
    return this.statsAccessRequests.filter(request => request.viewerRole === 'viewer');
  }

  get grantedStatsAccess(): StatsAccessRequest[] {
    return this.statsAccessRequests.filter(request => request.viewerRole === 'owner' && request.status === 'approved');
  }

  async openShareDialog(): Promise<void> {
    this.isShareDialogOpen = true;
    this.shareMode = null;
    this.isLoadingSharePlaylists = false;
    this.availablePlaylists = [];
    this.availableStatsUsers = [];
    this.selectedPlaylistId = '';
    this.selectedStatsOwnerId = '';
    this.shareLink = '';
    this.shareError = '';
    this.shareLinkCopied = false;
  }

  async selectShareMode(mode: 'playlist' | 'stats'): Promise<void> {
    this.shareMode = mode;
    this.shareError = '';
    if (mode === 'stats') {
      this.isLoadingStatsUsers = true;
      this.availableStatsUsers = [];
      this.selectedStatsOwnerId = '';
      try {
        this.availableStatsUsers = await this.statsSharing.listAvailableUsers();
      } catch (error) {
        this.shareError = this.describeError(error);
      } finally {
        this.isLoadingStatsUsers = false;
      }
      return;
    }

    if (!this.canCreateShares) {
      this.shareError = 'Enable Cloud Backup before sharing a playlist.';
      return;
    }
    this.isLoadingSharePlaylists = true;
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
    if (this.isCreatingShare || this.isRequestingStats) return;
    this.isShareDialogOpen = false;
    this.shareMode = null;
    this.availablePlaylists = [];
    this.availableStatsUsers = [];
    this.selectedPlaylistId = '';
    this.selectedStatsOwnerId = '';
    this.shareLink = '';
    this.shareError = '';
    this.shareLinkCopied = false;
  }

  async requestStatsAccess(): Promise<void> {
    if (this.isRequestingStats) return;
    const owner = this.selectedStatsOwner;
    if (!owner) {
      this.shareError = 'Select a registered user whose stats you want to view.';
      return;
    }
    this.isRequestingStats = true;
    this.shareError = '';
    try {
      await this.statsSharing.requestAccess(owner.userId);
      this.successMessage = `Your stats request was sent to ${owner.displayName}.`;
      this.isRequestingStats = false;
      this.closeShareDialog();
      await this.reload(true);
    } catch (error) {
      this.shareError = this.describeError(error);
    } finally {
      this.isRequestingStats = false;
    }
  }

  async respondToStatsRequest(approve: boolean): Promise<void> {
    const request = this.consentRequest;
    if (!request || this.busyStatsRequestId) return;
    this.busyStatsRequestId = request.id;
    try {
      await this.statsSharing.respondToRequest(request.id, approve);
      this.successMessage = approve
        ? `${request.viewerDisplayName} can now view your saved stats.`
        : `You declined ${request.viewerDisplayName}’s stats request.`;
      this.dismissedConsentRequestIds.add(request.id);
      this.consentRequest = null;
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.busyStatsRequestId = '';
    }
  }

  async revokeStatsAccess(request: StatsAccessRequest): Promise<void> {
    if (this.busyStatsRequestId) return;
    const otherUser = request.viewerRole === 'owner'
      ? request.viewerDisplayName
      : request.ownerDisplayName;
    if (!window.confirm(`Revoke stats access shared with ${otherUser}?`)) return;
    this.busyStatsRequestId = request.id;
    try {
      await this.statsSharing.revokeAccess(request.id);
      this.successMessage = `Stats access shared with ${otherUser} was revoked.`;
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.busyStatsRequestId = '';
    }
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

  private selectNextConsentRequest(): void {
    if (this.consentRequest) return;
    this.consentRequest = this.statsAccessRequests
      .filter(request => request.viewerRole === 'owner' && request.status === 'pending')
      .filter(request => !this.dismissedConsentRequestIds.has(request.id))
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))[0] || null;
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
    return value?.message || value?.error_description || 'Private sharing could not be loaded.';
  }
}
