import {Component, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "@core/data-access/spotify/spotify-data.service";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {firstValueFrom} from 'rxjs';

@Component({
  selector: 'app-playlists', templateUrl: './playlists.component.html', styleUrls: ['./playlists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PlaylistsComponent {
  playlists: any[] = [];
  filteredPlaylists: any[] = [];
  searchText: string = '';
  sortOrder: 'asc' | 'desc' | 'none' = 'none';
  isRefreshingPlaylists = false;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService
  ) {
    this.route.params.subscribe(async () => {
      const userId = this.authService.getUserId() || 'anonymous';
      this.sortOrder = (this.storageService.getItem(`${userId}_playlists_sortOrder`) as 'asc' | 'desc' | 'none') || 'none';
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
            const profileId = this.storageService.getItem(profileIdKey);
            if (profileId) {
              parsedPlaylists = parsedPlaylists.filter(playlist =>
                playlist.id === 'fav' ||
                playlist.owner?.id === profileId ||
                playlist.collaborative === true
              );
            }
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
        this.spotifyDataService.getAccessibleUserPlaylists(knownProfileId)
      );
      if (response.currentUserId) {
        this.storageService.setItem(profileIdKey, response.currentUserId);
      }
      const refreshedPlaylists = (response.items || []).map((playlist: any) => ({
        ...playlist,
        tracks: playlist.items || {total: 0}
      }));

      let favouriteTotal = this.getCachedFavouriteTotal(userId, cachedPlaylists);
      try {
        const favouriteTracks = await firstValueFrom(this.spotifyDataService.getFavTracks(0, 1));
        if (Number.isFinite(favouriteTracks?.total)) favouriteTotal = favouriteTracks.total;
      } catch (error) {
        console.warn('[Playlists] Could not refresh Liked Songs count; keeping the cached count.', error);
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



  viewAnalysis(playlistId: string) {
    this.router.navigate(['/analysis', playlistId]);
  }

  get isSortedByCount(): boolean {
    return this.sortOrder !== 'none';
  }

  filterPlaylists() {
    if (this.searchText.trim() === '') {
      this.filteredPlaylists = [...this.playlists];
    } else {
      this.filteredPlaylists = this.playlists.filter(playlist =>
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

}
