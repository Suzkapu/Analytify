import {Component, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "@core/data-access/spotify/spotify-data.service";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {firstValueFrom} from 'rxjs';
import {ComparePlaylist, CompareSaveResult, CompareTrack} from '@core/compare-room/compare-room.models';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';

@Component({
  selector: 'app-playlists', templateUrl: './playlists.component.html', styleUrls: ['./playlists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PlaylistsComponent {
  playlists: any[] = [];
  filteredPlaylists: any[] = [];
  searchText: string = '';
  sortOrder: 'asc' | 'desc' | 'none' = 'none';
  showSavedPlaylists = false;
  isRefreshingPlaylists = false;
  isMergeSelectionMode = false;
  selectedPlaylistIds = new Set<string>();
  mergedPlaylistName = '';
  isMergedPlaylistNameEdited = false;
  isCreatingMergedPlaylist = false;
  mergeProgress = '';
  mergeError = '';
  mergeResult: CompareSaveResult | null = null;
  private currentSpotifyProfileId = '';

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private comparePlaylistSource: ComparePlaylistSourceService,
    private participantSpotify: ParticipantSpotifyService
  ) {
    this.route.params.subscribe(async () => {
      const userId = this.authService.getUserId() || 'anonymous';
      this.sortOrder = (this.storageService.getItem(`${userId}_playlists_sortOrder`) as 'asc' | 'desc' | 'none') || 'none';
      this.showSavedPlaylists = this.storageService.getItem(`${userId}_playlists_showSaved`) === 'true';
      if (this.authService.isAuthenticated()) {
        await this.authService.ensureInitialSync();
      }
      await this.loadPlaylists();
    });
  }

  async loadPlaylists() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_playlists`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const profileIdKey = `${userId}_spotify_profile_id`;
    const isBackupActive = this.authService.isBackupActive();
    this.currentSpotifyProfileId = this.storageService.getItem(profileIdKey)
      || (userId !== 'anonymous' ? this.stripDevSuffix(userId) : '');
    let storedPlaylists = this.storageService.getItem(storageKey);
    let parsedPlaylists: any[] = [];
    let isParseError = false;

    const parseCachedPlaylists = () => {
      parsedPlaylists = [];
      isParseError = false;
      if (storedPlaylists) {
        try {
          const parsed = JSON.parse(storedPlaylists);
          if (!Array.isArray(parsed)) {
            isParseError = true;
          } else {
            parsedPlaylists = parsed;
          }
        } catch (e) {
          console.warn('Failed to parse cached playlists:', e);
          isParseError = true;
        }
      }
    };

    parseCachedPlaylists();

    // The cached list paints immediately. If it is absent or corrupt, make one
    // feature-scoped Supabase read before the unconditional Spotify refresh.
    if ((!storedPlaylists || isParseError) && isBackupActive) {
      await this.storageService.restoreItemsFromCloud([storageKey, lastUpdatedKey]);
      storedPlaylists = this.storageService.getItem(storageKey);
      parseCachedPlaylists();
    }

    if (storedPlaylists && !isParseError) {
      console.log('[Playlists] Painting the playlist list from cache before refreshing Spotify.');
      this.playlists = parsedPlaylists;

      // Sync Favourite Tracks total with the latest loaded amount if available
      const favPlaylist = this.playlists.find(p => p.id === 'fav');
      if (favPlaylist) {
        const storedAmountStr = this.storageService.getItem(`${userId}_fav_Amount`);
        let updated = false;
        if (storedAmountStr) {
          try {
            const storedAmount = JSON.parse(storedAmountStr);
            if (storedAmount !== favPlaylist.tracks.total) {
              favPlaylist.tracks.total = storedAmount;
              updated = true;
            }
          } catch (e) {}
        }

        if (updated) {
          this.storageService.setItem(storageKey, JSON.stringify(this.playlists));
        }
      }

      this.filterPlaylists();
    }

    await this.refreshPlaylistsFromSpotify(
      userId,
      storageKey,
      lastUpdatedKey,
      profileIdKey,
      parsedPlaylists
    );
  }

  private async refreshPlaylistsFromSpotify(
    userId: string,
    storageKey: string,
    lastUpdatedKey: string,
    profileIdKey: string,
    cachedPlaylists: any[]
  ): Promise<void> {
    this.isRefreshingPlaylists = true;
    const cachedProfileId = this.storageService.getItem(profileIdKey);
    const authProfileId = userId !== 'anonymous' ? this.stripDevSuffix(userId) : undefined;
    const knownProfileId = cachedProfileId || authProfileId;
    try {
      const response = await firstValueFrom(
        this.spotifyDataService.getAccessibleUserPlaylists(knownProfileId, true)
      );
      if (response.currentUserId) {
        this.currentSpotifyProfileId = response.currentUserId;
        this.storageService.setItem(profileIdKey, response.currentUserId);
      }
      const refreshedPlaylists = (response.items || []).map((playlist: any) => ({
        ...playlist,
        tracks: playlist.items || {total: 0}
      }));

      let favouriteTotal = this.getCachedFavouriteTotal(userId, cachedPlaylists);
      const favouriteTotalUpdatedKey = `${userId}_fav_Amount_lastUpdated`;
      if (!this.isFreshSinceDailyCutoff(this.storageService.getItem(favouriteTotalUpdatedKey))) {
        try {
          const favouriteTracks = await firstValueFrom(this.spotifyDataService.getFavTracks(0, 1));
          if (Number.isFinite(favouriteTracks?.total)) {
            favouriteTotal = favouriteTracks.total;
            this.storageService.setItem(favouriteTotalUpdatedKey, Date.now().toString());
          }
        } catch (error) {
          console.warn('[Playlists] Could not refresh Liked Songs count; keeping the cached count.', error);
        }
      }

      this.playlists = [this.createFavouritePlaylist(favouriteTotal), ...refreshedPlaylists];
      this.storageService.setItem(`${userId}_fav_Amount`, JSON.stringify(favouriteTotal));
      this.storageService.setItem(storageKey, JSON.stringify(this.playlists));
      this.storageService.setItem(lastUpdatedKey, Date.now().toString());
      this.filterPlaylists();
    } catch (error) {
      console.error('[Playlists] Spotify refresh failed; keeping the cached playlist list.', error);
      if (cachedPlaylists.length > 0 && this.playlists.length === 0) {
        this.playlists = cachedPlaylists;
        this.filterPlaylists();
      }
    } finally {
      this.isRefreshingPlaylists = false;
    }
  }

  private isFreshSinceDailyCutoff(timestamp: string | null): boolean {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return false;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0);
    if (now.getTime() < cutoff.getTime()) cutoff.setDate(cutoff.getDate() - 1);
    return value >= cutoff.getTime();
  }



  viewAnalysis(playlistId: string) {
    this.router.navigate(['/analysis', playlistId]);
  }

  get isSortedByCount(): boolean {
    return this.sortOrder !== 'none';
  }

  filterPlaylists() {
    const visiblePlaylists = this.showSavedPlaylists
      ? this.playlists
      : this.playlists.filter(playlist => !this.isSavedPlaylist(playlist));
    if (this.searchText.trim() === '') {
      this.filteredPlaylists = [...visiblePlaylists];
    } else {
      this.filteredPlaylists = visiblePlaylists.filter(playlist =>
        playlist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }

    if (this.sortOrder === 'desc') {
      this.filteredPlaylists.sort((a, b) => {
        const countA = a.tracks ? a.tracks.total : 0;
        const countB = b.tracks ? b.tracks.total : 0;
        return countB - countA;
      });
    } else if (this.sortOrder === 'asc') {
      this.filteredPlaylists.sort((a, b) => {
        const countA = a.tracks ? a.tracks.total : 0;
        const countB = b.tracks ? b.tracks.total : 0;
        return countA - countB;
      });
    }
  }

  get savedPlaylistCount(): number {
    return this.playlists.filter(playlist => this.isSavedPlaylist(playlist)).length;
  }

  toggleSavedPlaylists(): void {
    this.showSavedPlaylists = !this.showSavedPlaylists;
    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.setItem(`${userId}_playlists_showSaved`, String(this.showSavedPlaylists));
    this.filterPlaylists();
    if (!this.showSavedPlaylists) {
      const visibleIds = new Set(this.filteredPlaylists.map(playlist => playlist.id));
      this.selectedPlaylistIds.forEach(playlistId => {
        if (!visibleIds.has(playlistId)) this.selectedPlaylistIds.delete(playlistId);
      });
      this.updateDefaultMergedPlaylistName();
    }
  }

  isSavedPlaylist(playlist: any): boolean {
    if (!playlist || playlist.id === 'fav' || playlist.collaborative === true) return false;
    const ownerId = playlist.owner?.id;
    if (!ownerId || !this.currentSpotifyProfileId) return false;
    return ownerId !== this.currentSpotifyProfileId;
  }

  sortPlaylistsByTracks() {
    if (this.sortOrder === 'none') {
      this.sortOrder = 'desc';
    } else if (this.sortOrder === 'desc') {
      this.sortOrder = 'asc';
    } else {
      this.sortOrder = 'none';
    }
    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.setItem(`${userId}_playlists_sortOrder`, this.sortOrder);
    this.filterPlaylists();
  }

  toggleMergeSelectionMode(): void {
    if (this.isCreatingMergedPlaylist) return;
    this.isMergeSelectionMode = !this.isMergeSelectionMode;
    this.selectedPlaylistIds.clear();
    this.mergedPlaylistName = '';
    this.isMergedPlaylistNameEdited = false;
    this.mergeError = '';
    this.mergeProgress = '';
    if (this.isMergeSelectionMode) this.mergeResult = null;
  }

  togglePlaylistSelection(playlist: any): void {
    if (!this.isMergeSelectionMode || this.isCreatingMergedPlaylist || !playlist?.id) return;
    if (this.selectedPlaylistIds.has(playlist.id)) {
      this.selectedPlaylistIds.delete(playlist.id);
    } else {
      this.selectedPlaylistIds.add(playlist.id);
    }
    this.updateDefaultMergedPlaylistName();
    this.mergeError = '';
  }

  isPlaylistSelected(playlistId: string): boolean {
    return this.selectedPlaylistIds.has(playlistId);
  }

  get selectedPlaylists(): any[] {
    return Array.from(this.selectedPlaylistIds)
      .map(playlistId => this.playlists.find(playlist => playlist.id === playlistId))
      .filter(Boolean);
  }

  onMergedPlaylistNameChange(value: string): void {
    this.mergedPlaylistName = value;
    this.isMergedPlaylistNameEdited = true;
  }

  async createMergedPlaylist(): Promise<void> {
    const selectedPlaylists = this.selectedPlaylists;
    const playlistName = this.mergedPlaylistName.trim();
    if (selectedPlaylists.length < 2 || !playlistName || this.isCreatingMergedPlaylist) return;

    this.isCreatingMergedPlaylist = true;
    this.mergeError = '';
    this.mergeResult = null;
    try {
      const accessToken = await this.getUsableAccessToken();
      const spotifyUserId = this.authService.getUserId();
      if (!spotifyUserId) throw new Error('Your Spotify profile is unavailable. Please log in again.');

      const mergedTracks: CompareTrack[] = [];
      const seenTrackIds = new Set<string>();
      for (let index = 0; index < selectedPlaylists.length; index++) {
        const playlist = this.toComparePlaylist(selectedPlaylists[index]);
        this.mergeProgress = `Loading ${playlist.name} (${index + 1}/${selectedPlaylists.length})…`;
        const result = await this.comparePlaylistSource.loadMainTracks(
          playlist,
          accessToken,
          spotifyUserId
        );
        result.tracks.forEach(track => {
          if (!seenTrackIds.has(track.id)) {
            seenTrackIds.add(track.id);
            mergedTracks.push(track);
          }
        });
      }

      if (mergedTracks.length === 0) {
        throw new Error('The selected playlists do not contain any usable Spotify tracks.');
      }

      this.mergeProgress = `Creating “${playlistName}” with ${mergedTracks.length} unique songs…`;
      const description = this.createMergedPlaylistDescription(selectedPlaylists);
      const saveResult = await this.participantSpotify.createPlaylist(
        accessToken,
        playlistName,
        description,
        mergedTracks
      );
      if (!saveResult.success) {
        // Spotify may have created the playlist before one of the 100-track
        // batches failed. Preserve that result so the user can inspect it.
        this.mergeResult = saveResult;
        throw new Error(saveResult.error || 'Spotify could not create the merged playlist.');
      }

      this.mergeResult = saveResult;
      this.addMergedPlaylistToView(saveResult, playlistName, description, spotifyUserId);
      this.isMergeSelectionMode = false;
      this.selectedPlaylistIds.clear();
      this.mergedPlaylistName = '';
      this.isMergedPlaylistNameEdited = false;
    } catch (error) {
      this.mergeError = error instanceof Error
        ? error.message
        : 'The merged playlist could not be created.';
    } finally {
      this.isCreatingMergedPlaylist = false;
      this.mergeProgress = '';
    }
  }

  dismissMergeResult(): void {
    this.mergeResult = null;
  }

  viewSongs(playlistId: string) {
    this.router.navigate(['/songs', playlistId]);
  }

  private getCachedFavouriteTotal(userId: string, cachedPlaylists: any[]): number {
    const storedAmount = this.storageService.getItem(`${userId}_fav_Amount`);
    if (storedAmount) {
      try {
        const parsedAmount = JSON.parse(storedAmount);
        if (Number.isFinite(parsedAmount) && parsedAmount >= 0) {
          return parsedAmount;
        }
      } catch {
        // Fall through to the cached playlist-list value.
      }
    }

    const cachedFavourite = cachedPlaylists.find(playlist => playlist?.id === 'fav');
    const cachedTotal = cachedFavourite?.tracks?.total;
    return Number.isFinite(cachedTotal) && cachedTotal >= 0 ? cachedTotal : 0;
  }

  private createFavouritePlaylist(total: number): any {
    return {
      name: 'Favourite Tracks',
      id: 'fav',
      images: {
        0: {
          url: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
        },
      },
      tracks: { total }
    };
  }

  private updateDefaultMergedPlaylistName(): void {
    if (this.isMergedPlaylistNameEdited) return;
    const names = this.selectedPlaylists.map(playlist => playlist.name).filter(Boolean);
    this.mergedPlaylistName = names.length > 0
      ? `Merged — ${names.join(' + ')}`.slice(0, 100)
      : '';
  }

  private toComparePlaylist(playlist: any): ComparePlaylist {
    return {
      id: playlist.id,
      name: playlist.name || 'Untitled playlist',
      imageUrl: playlist.images?.[0]?.url || '',
      total: Number(playlist.tracks?.total ?? playlist.items?.total ?? 0),
      ownerName: playlist.owner?.display_name || playlist.owner?.id || '',
      isLikedSongs: playlist.id === 'fav'
    };
  }

  private createMergedPlaylistDescription(playlists: any[]): string {
    const names = playlists.map(playlist => playlist.name).filter(Boolean).join(', ');
    return `Merged from ${names} by Analytify. Duplicates removed.`.slice(0, 300);
  }

  private async getUsableAccessToken(): Promise<string> {
    let accessToken = this.authService.getAccessToken();
    if (this.authService.isTokenExpired()) {
      const refreshResult = await firstValueFrom(this.authService.refreshToken());
      accessToken = refreshResult?.access_token || this.authService.getAccessToken();
    }
    if (!accessToken) throw new Error('Your Spotify session is unavailable. Please log in again.');
    return accessToken;
  }

  private addMergedPlaylistToView(
    result: CompareSaveResult,
    name: string,
    description: string,
    spotifyUserId: string
  ): void {
    if (!result.playlistId) return;
    const userId = this.authService.getUserId() || spotifyUserId;
    const mergedPlaylist = {
      id: result.playlistId,
      name,
      description,
      images: [],
      owner: {id: this.stripDevSuffix(spotifyUserId)},
      collaborative: false,
      tracks: {total: result.addedTracks}
    };
    const favourite = this.playlists.find(playlist => playlist.id === 'fav');
    const remaining = this.playlists.filter(playlist => playlist.id !== 'fav' && playlist.id !== result.playlistId);
    this.playlists = favourite
      ? [favourite, mergedPlaylist, ...remaining]
      : [mergedPlaylist, ...remaining];
    this.storageService.setItem(`${userId}_playlists`, JSON.stringify(this.playlists));
    this.filterPlaylists();
  }

  private stripDevSuffix(userId: string): string {
    return userId.endsWith('_dev') ? userId.slice(0, -4) : userId;
  }

}
