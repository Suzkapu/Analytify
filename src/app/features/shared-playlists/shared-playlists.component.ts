import {Component, HostListener, OnDestroy, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ComparePlaylist} from '@core/compare-room/compare-room.models';
import {PlaylistShare, PlaylistSharePublication} from '@core/sharing/playlist-sharing.models';
import {sharedPlaylistName} from '@core/sharing/playlist-sharing-names';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {ModerationCase, StatsAccessRequest} from '@core/sharing/stats-sharing.models';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {PlaylistShareAutoSyncService} from '@core/sharing/playlist-share-auto-sync.service';
import {SPOTIFY_RESTRICTED_FEATURES_ENABLED} from '@core/compliance/spotify-policy-gate';

const console = createScopedLogger('Shared Playlists');

@Component({
    selector: 'app-shared-playlists',
    templateUrl: './shared-playlists.component.html',
    styleUrls: ['./shared-playlists.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SharedPlaylistsComponent implements OnInit, OnDestroy {
  readonly restrictedFeaturesEnabled = SPOTIFY_RESTRICTED_FEATURES_ENABLED;
  receivedShares: PlaylistShare[] = [];
  ownedShares: PlaylistShare[] = [];
  availablePlaylists: ComparePlaylist[] = [];
  isLoading = true;
  busyShareId = '';
  receivedShareRemovalRequest: PlaylistShare | null = null;
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
  statsAccessRequests: StatsAccessRequest[] = [];
  isCreatingStatsLink = false;
  statsRequestLink = '';
  statsRequestLinkCopied = false;
  statsShareLink = '';
  statsShareLinkCopied = false;
  consentRequest: StatsAccessRequest | null = null;
  consentError = '';
  statsRevocationRequest: StatsAccessRequest | null = null;
  busyStatsRequestId = '';
  moderationRequest: StatsAccessRequest | null = null;
  moderationReason = '';
  isModeratingStatsUser = false;
  moderationCases: ModerationCase[] = [];
  appealDrafts: Record<string, string> = {};
  appealingReportId = '';

  private unsubscribeFromShareChanges: (() => void) | null = null;
  private unsubscribeFromStatsChanges: (() => void) | null = null;
  private silentReloadPromise: Promise<void> | null = null;
  private dismissedConsentRequestIds = new Set<string>();
  private destroyed = false;

  constructor(
    private sharing: PlaylistSharingService,
    private auth: SpotifyAuthService,
    private source: ComparePlaylistSourceService,
    private statsSharing: StatsSharingService,
    private shareAutoSync: PlaylistShareAutoSyncService
  ) {}

  async ngOnInit(): Promise<void> {
    this.destroyed = false;
    this.shareAutoSync.start();
    await this.reload();
    if (this.destroyed) return;
    this.unsubscribeFromShareChanges = this.sharing.subscribeToShareChanges(() => {
      this.reloadSilently();
    });
    if (this.restrictedFeaturesEnabled) {
      this.unsubscribeFromStatsChanges = this.statsSharing.subscribeToAccessChanges(() => this.reloadSilently());
    }
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if (!this.destroyed) this.reloadSilently();
  }

  @HostListener('window:online')
  onWindowOnline(): void {
    if (!this.destroyed) this.reloadSilently();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
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
      [this.receivedShares, this.ownedShares, this.statsAccessRequests, this.moderationCases] = await Promise.all([
        this.sharing.listReceivedShares(),
        this.sharing.listOwnedShares(),
        this.restrictedFeaturesEnabled ? this.statsSharing.listAccessRequests() : Promise.resolve([]),
        this.restrictedFeaturesEnabled ? this.statsSharing.listModerationCases() : Promise.resolve([])
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
    this.selectedPlaylistId = '';
    this.shareLink = '';
    this.statsRequestLink = '';
    this.statsRequestLinkCopied = false;
    this.statsShareLink = '';
    this.statsShareLinkCopied = false;
    this.shareError = '';
    this.shareLinkCopied = false;
  }

  async selectShareMode(mode: 'playlist' | 'stats'): Promise<void> {
    if (mode === 'stats' && !this.restrictedFeaturesEnabled) {
      this.shareError = 'Stats sharing is disabled pending written Spotify approval.';
      return;
    }
    this.shareMode = mode;
    this.shareError = '';
    if (mode === 'stats') {
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
    if (this.isCreatingShare || this.isCreatingStatsLink) return;
    this.isShareDialogOpen = false;
    this.shareMode = null;
    this.availablePlaylists = [];
    this.selectedPlaylistId = '';
    this.shareLink = '';
    this.statsRequestLink = '';
    this.statsRequestLinkCopied = false;
    this.statsShareLink = '';
    this.statsShareLinkCopied = false;
    this.shareError = '';
    this.shareLinkCopied = false;
  }

  async createStatsRequestLink(): Promise<void> {
    if (this.isCreatingStatsLink) return;
    this.isCreatingStatsLink = true;
    this.shareError = '';
    try {
      const created = await this.statsSharing.createAccessInvite();
      this.statsRequestLink = created.claimUrl;
      this.statsRequestLinkCopied = false;
    } catch (error) {
      this.shareError = this.describeError(error);
    } finally {
      this.isCreatingStatsLink = false;
    }
  }

  async createStatsShareLink(): Promise<void> {
    if (this.isCreatingStatsLink) return;
    this.isCreatingStatsLink = true;
    this.shareError = '';
    try {
      const created = await this.statsSharing.createShareInvite();
      this.statsShareLink = created.claimUrl;
      this.statsShareLinkCopied = false;
    } catch (error) {
      this.shareError = this.describeError(error);
    } finally {
      this.isCreatingStatsLink = false;
    }
  }

  async copyStatsRequestLink(): Promise<void> {
    if (!this.statsRequestLink) return;
    try {
      await navigator.clipboard.writeText(this.statsRequestLink);
      this.statsRequestLinkCopied = true;
    } catch {
      this.shareError = 'Clipboard access is unavailable. Select and copy the link manually.';
    }
  }

  async copyStatsShareLink(): Promise<void> {
    if (!this.statsShareLink) return;
    try {
      await navigator.clipboard.writeText(this.statsShareLink);
      this.statsShareLinkCopied = true;
    } catch {
      this.shareError = 'Clipboard access is unavailable. Select and copy the link manually.';
    }
  }


  async respondToStatsRequest(approve: boolean): Promise<void> {
    const request = this.consentRequest;
    if (!request || this.busyStatsRequestId) return;
    this.busyStatsRequestId = request.id;
    this.consentError = '';
    try {
      await this.statsSharing.respondToRequest(request.id, approve);
      this.successMessage = approve
        ? `${request.viewerDisplayName} can now view your saved stats.`
        : `You declined ${request.viewerDisplayName}’s stats request.`;
      this.dismissedConsentRequestIds.add(request.id);
      this.consentRequest = null;
      this.statsAccessRequests = this.statsAccessRequests.map(item => item.id === request.id
        ? {
          ...item,
          status: approve ? 'approved' : 'declined',
          respondedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        : item);
      this.selectNextConsentRequest();
    } catch (error) {
      this.consentError = this.describeError(error);
    } finally {
      this.busyStatsRequestId = '';
    }
  }

  openStatsRevocation(request: StatsAccessRequest): void {
    if (this.busyStatsRequestId) return;
    this.statsRevocationRequest = request;
  }

  closeStatsRevocation(): void {
    if (this.busyStatsRequestId) return;
    this.statsRevocationRequest = null;
  }

  async confirmStatsRevocation(): Promise<void> {
    const request = this.statsRevocationRequest;
    if (!request || this.busyStatsRequestId) return;
    const otherUser = request.viewerRole === 'owner'
      ? request.viewerDisplayName
      : request.ownerDisplayName;
    this.busyStatsRequestId = request.id;
    try {
      await this.statsSharing.revokeAccess(request.id);
      this.successMessage = `Stats access shared with ${otherUser} was revoked.`;
      this.statsRevocationRequest = null;
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.busyStatsRequestId = '';
    }
  }

  openStatsModeration(request: StatsAccessRequest): void {
    this.moderationRequest = request;
    this.moderationReason = '';
  }

  closeStatsModeration(): void {
    if (!this.isModeratingStatsUser) this.moderationRequest = null;
  }

  async blockStatsUser(report = false): Promise<void> {
    const request = this.moderationRequest;
    if (!request || this.isModeratingStatsUser) return;
    const otherUserId = request.viewerRole === 'owner' ? request.viewerUserId : request.ownerUserId;
    const otherName = request.viewerRole === 'owner' ? request.viewerDisplayName : request.ownerDisplayName;
    if (report && this.moderationReason.trim().length < 3) {
      this.errorMessage = 'Describe the report in at least 3 characters.';
      return;
    }
    this.isModeratingStatsUser = true;
    try {
      if (report) {
        const receipt = await this.statsSharing.reportUser(otherUserId, this.moderationReason);
        this.successMessage = `${otherName} was blocked and reported. Receipt ${receipt.receiptCode}.`;
      } else {
        await this.statsSharing.blockUser(otherUserId);
        this.successMessage = `${otherName} was blocked.`;
      }
      this.moderationRequest = null;
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.isModeratingStatsUser = false;
    }
  }

  async appealModerationCase(moderationCase: ModerationCase): Promise<void> {
    const reason = (this.appealDrafts[moderationCase.reportId] || '').trim();
    if (reason.length < 3 || this.appealingReportId) return;
    this.appealingReportId = moderationCase.reportId;
    this.errorMessage = '';
    try {
      await this.statsSharing.appealModerationCase(moderationCase.reportId, reason);
      this.successMessage = `Appeal sent for ${moderationCase.receiptCode}.`;
      delete this.appealDrafts[moderationCase.reportId];
      await this.reload(true);
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.appealingReportId = '';
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
    if (!this.canCreateShares) {
      this.errorMessage = 'Enable Cloud Backup before refreshing a shared playlist snapshot.';
      return;
    }
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
      const revision = await this.sharing.refreshShare(share.id, share.revision, publication);
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

  openReceivedShareRemoval(share: PlaylistShare): void {
    if (!this.busyShareId) this.receivedShareRemovalRequest = share;
  }

  closeReceivedShareRemoval(): void {
    if (!this.busyShareId) this.receivedShareRemovalRequest = null;
  }

  async confirmReceivedShareRemoval(): Promise<void> {
    const share = this.receivedShareRemovalRequest;
    if (!share || this.busyShareId) return;
    this.busyShareId = share.id;
    this.errorMessage = '';
    try {
      await this.sharing.removeReceivedShare(share.id);
      this.receivedShares = this.receivedShares.filter(item => item.id !== share.id);
      this.receivedShareRemovalRequest = null;
      this.successMessage = `“${share.playlistName}” was removed from your shared playlists.`;
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
    this.consentError = '';
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
