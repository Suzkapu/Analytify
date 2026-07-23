import {Component, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";

@Component({
  selector: 'app-playlists', templateUrl: './playlists.component.html', styleUrls: ['./playlists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PlaylistsComponent {
  playlists: any[] = [];
  filteredPlaylists: any[] = [];
  searchText: string = '';
  sortOrder: 'asc' | 'desc' | 'none' = 'none';

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

  isCacheExpired(lastUpdatedStr: string | null): boolean {
    if (!lastUpdatedStr) return true;
    const lastUpdated = parseInt(lastUpdatedStr, 10);
    if (isNaN(lastUpdated)) return true;

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0); // 1:00 AM today
    if (now.getTime() < cutoff.getTime()) {
      // If we haven't reached 1 AM today yet, the most recent cutoff was 1 AM yesterday
      cutoff.setDate(cutoff.getDate() - 1);
    }
    return lastUpdated < cutoff.getTime();
  }

  async loadPlaylists() {
    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const storageKey = `${userId}_playlists`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const profileIdKey = `${userId}_spotify_profile_id`;
    const isBackupActive = this.authService.isBackupActive();
    let storedPlaylists = this.storageService.getItem(storageKey);
    let lastUpdated = this.storageService.getItem(lastUpdatedKey);
    let isExpired = this.isCacheExpired(lastUpdated);
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

    // A stale/missing local dataset gets one feature-scoped Supabase lookup
    // before Spotify is contacted.
    if ((!storedPlaylists || isExpired || isParseError) && isBackupActive) {
      await this.storageService.restoreItemsFromCloud([storageKey, lastUpdatedKey]);
      storedPlaylists = this.storageService.getItem(storageKey);
      lastUpdated = this.storageService.getItem(lastUpdatedKey);
      isExpired = this.isCacheExpired(lastUpdated);
      parseCachedPlaylists();
    }

    if (storedPlaylists && !isExpired && !isParseError) {
      console.log(isBackupActive ? "[Playlists] Loading playlists from Supabase Cloud Backup (Local Cache)" : "[Playlists] Loading playlists from Local Storage Cache (Cloud Backup disabled)");
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
    } else {
      const reason = !storedPlaylists ? 'no local cache' : (isExpired ? 'cache expired' : 'unknown');
      console.log(`[Playlists] Cache missing or expired (reason: ${reason}, backup active: ${isBackupActive}). Loading playlists from Spotify API`);
      this.spotifyDataService.getAccessibleUserPlaylists().subscribe({
        next: (playlists: any) => {
          if (playlists.currentUserId) {
            this.storageService.setItem(profileIdKey, playlists.currentUserId);
          }
          this.playlists = (playlists.items || []).map((playlist: any) => ({
            ...playlist,
            tracks: playlist.items || { total: 0 }
          }));

          // Get total amount of favourite tracks
          this.spotifyDataService.getFavTracks(0, 1).subscribe({
            next: (favTracks: any) => {
              const favPlaylist = {
                name: 'Favourite Tracks',
                id: 'fav',
                images: {
                  0: {
                    url: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
                  },
                },
                tracks: {
                  total: favTracks.total
                }
              };
              this.playlists = [favPlaylist, ...this.playlists];
              this.storageService.setItem(storageKey, JSON.stringify(this.playlists));
              this.storageService.setItem(lastUpdatedKey, Date.now().toString());
              this.filterPlaylists();
            },
            error: (err) => {
              console.error('Failed to load favourite tracks count', err);
              const favPlaylist = {
                name: 'Favourite Tracks',
                id: 'fav',
                images: {
                  0: {
                    url: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
                  },
                },
                tracks: {
                  total: 0
                }
              };
              this.playlists = [favPlaylist, ...this.playlists];
              this.storageService.setItem(storageKey, JSON.stringify(this.playlists));
              this.storageService.setItem(lastUpdatedKey, Date.now().toString());
              this.filterPlaylists();
            }
          });
        },
        error: (err) => {
          console.error('Failed to load playlists from API:', err);
          if (storedPlaylists) {
            this.playlists = JSON.parse(storedPlaylists);
            this.filterPlaylists();
          }
        }
      });
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

}
