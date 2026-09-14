import {Component, ViewEncapsulation, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "@core/data-access/spotify/spotify-data.service";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {firstValueFrom} from 'rxjs';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';

const console = createScopedLogger('Playlists');

@Component({
    selector: 'app-playlists', templateUrl: './playlists.component.html', styleUrls: ['./playlists.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PlaylistsComponent {
  playlists: any[] = [];
  filteredPlaylists: any[] = [];
  searchText: string = '';
  sortOrder: 'asc' | 'desc' | 'none' = 'none';
  showSavedPlaylists = false;
  isLoadingPlaylists = true;
  isRefreshingPlaylists = false;
  private currentSpotifyProfileId = '';
  private playlistLoadSequence = 0;
  private readonly cloudPriorityWindowMs = 750;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private playlistLoaderService: PlaylistLoaderService
  ) {
    this.route.params.subscribe(async () => {
      const userId = this.authService.getUserId() || 'anonymous';
      this.sortOrder = (this.storageService.getItem(`${userId}_playlists_sortOrder`) as 'asc' | 'desc' | 'none') || 'none';
      this.showSavedPlaylists = this.storageService.getItem(`${userId}_playlists_showSaved`) === 'true';
      if (this.authService.isAuthenticated()) {
        void this.authService.ensureInitialSync().catch(() => {});
      }
      await this.loadPlaylists();
    });
  }

  async loadPlaylists() {
    const loadSequence = ++this.playlistLoadSequence;
    const isCurrentLoad = () => loadSequence === this.playlistLoadSequence;
    const finishInitialLoad = () => {
      if (isCurrentLoad()) this.isLoadingPlaylists = false;
    };
    this.isLoadingPlaylists = this.playlists.length === 0;
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_playlists`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const profileIdKey = `${userId}_spotify_profile_id`;
    const profileIdVerifiedKey = `${userId}_spotify_profile_id_verified`;
    const isBackupActive = this.authService.isBackupActive();
    const isPersonalConnection = this.authService.isPersonalAppConnection();
    await this.storageService.hydrateItems?.([storageKey]);
    if (!isCurrentLoad()) return;
    this.currentSpotifyProfileId = this.storageService.getItem(profileIdKey)
      || (userId !== 'anonymous' && !isPersonalConnection ? this.stripDevSuffix(userId) : '');
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

    const paintCachedPlaylists = () => {
      if (!storedPlaylists || isParseError) return;

      console.log('[Playlists] Painting the playlist list from cache.');
      this.playlists = parsedPlaylists;

      // Sync Favourite Tracks total with the latest separately cached amount.
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
      if (this.playlists.length > 0) this.isLoadingPlaylists = false;
    };

    const hasCompleteFreshCache = () => {
      if (!storedPlaylists || isParseError || parsedPlaylists.length === 0) return false;
      const hasFavouriteTracks = parsedPlaylists.some(playlist => playlist?.id === 'fav');
      const hasCompletePortfolio = parsedPlaylists.every(playlist =>
        typeof playlist?.id === 'string' && Number.isFinite(playlist?.tracks?.total)
      );
      return hasFavouriteTracks
        && hasCompletePortfolio
        && this.isFreshSinceDailyCutoff(this.storageService.getItem(lastUpdatedKey));
    };

    parseCachedPlaylists();
    paintCachedPlaylists();

    // Older personal-app sessions may have cached account_id in this slot.
    // account_id is the correct stable Analytify identity, but playlist.owner.id
    // is the public Spotify user ID. Verify the cache once before classifying.
    if (isPersonalConnection && this.storageService.getItem(profileIdVerifiedKey) !== 'true') {
      try {
        const profile = await firstValueFrom(this.spotifyDataService.getCurrentUser());
        if (!isCurrentLoad()) return;
        if (profile?.id) {
          this.currentSpotifyProfileId = profile.id;
          this.storageService.setItem(profileIdKey, profile.id, false);
          this.storageService.setItem(profileIdVerifiedKey, 'true', false);
          this.filterPlaylists();
        }
      } catch (error) {
        console.warn('[Playlists] Could not resolve the public Spotify profile ID; ownership labels are deferred.', error);
      }
    }

    // A complete portfolio refreshed since the daily cutoff is authoritative.
    // Re-entering this route must not spend Spotify quota to rediscover it.
    if (hasCompleteFreshCache()) {
      this.isRefreshingPlaylists = false;
      finishInitialLoad();
      return;
    }

    // Expired, missing, or incomplete local data gets one bounded cloud chance.
    // If Supabase is slow, Spotify starts after the head-start; the late cloud
    // response is prevented from overwriting the newer fallback.
    if (isBackupActive) {
      this.isRefreshingPlaylists = true;
      let spotifyFallbackStarted = false;
      const cloudRestore = this.storageService.restoreItemsFromCloud(
        [storageKey, lastUpdatedKey],
        () => isCurrentLoad() && !spotifyFallbackStarted
      );
      const cloudFinishedInTime = await Promise.race([
        cloudRestore.then(() => true).catch(error => {
          console.warn('[Playlists] Cloud portfolio restore failed; continuing with Spotify.', error);
          return true;
        }),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), this.cloudPriorityWindowMs))
      ]);
      if (!isCurrentLoad()) return;
      if (cloudFinishedInTime) {
        storedPlaylists = this.storageService.getItem(storageKey);
        parseCachedPlaylists();
        paintCachedPlaylists();
        if (hasCompleteFreshCache()) {
          this.isRefreshingPlaylists = false;
          finishInitialLoad();
          return;
        }
      } else {
        spotifyFallbackStarted = true;
      }
    }

    if (!isCurrentLoad()) return;
    await this.refreshPlaylistsFromSpotify(
      userId,
      storageKey,
      lastUpdatedKey,
      profileIdKey,
      parsedPlaylists
    );
    finishInitialLoad();
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
    // A personal PKCE session may use Spotify's account_id as its durable
    // local key. That value is not comparable with playlist.owner.id, so force
    // one /me lookup until the callback/profile refresh has cached profile.id.
    const authProfileId = userId !== 'anonymous' && !this.authService.isPersonalAppConnection()
      ? this.stripDevSuffix(userId)
      : undefined;
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
      this.playlistLoaderService.recordPortfolioMetadata(
        userId,
        this.playlists,
        cachedPlaylists
      );
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

  private stripDevSuffix(userId: string): string {
    return userId.endsWith('_dev') ? userId.slice(0, -4) : userId;
  }

  trackPlaylist(_index: number, playlist: any): string {
    return playlist?.id || playlist?.uri || playlist?.name || String(_index);
  }

}
