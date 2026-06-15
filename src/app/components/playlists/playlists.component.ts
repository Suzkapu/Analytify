import {Component, ViewEncapsulation, HostListener} from '@angular/core';
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
  profilePicUrl: string | null = null;
  sortOrder: 'asc' | 'desc' | 'none' = 'none';
  showSettingsDropdown: boolean = false;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService
  ) {
    this.route.params.subscribe(() => {
      const userId = this.authService.getUserId() || 'anonymous';
      this.sortOrder = (this.storageService.getItem(`${userId}_playlists_sortOrder`) as 'asc' | 'desc' | 'none') || 'none';
      this.loadPlaylists();
      this.loadUserProfile();
    });
  }

  loadUserProfile() {
    const userId = this.authService.getUserId() || 'anonymous';
    const cached = this.storageService.getItem(`${userId}_profile_pic`);
    if (cached !== null) {
      this.profilePicUrl = cached || null;
    } else {
      this.spotifyDataService.getCurrentUser().subscribe({
        next: (user: any) => {
          const pic = user.images && user.images[0] ? user.images[0].url : '';
          this.storageService.setItem(`${userId}_profile_pic`, pic);
          this.profilePicUrl = pic || null;
        },
        error: (err) => console.error('Failed to load user profile:', err)
      });
    }
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

  loadPlaylists() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_playlists`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const storedPlaylists = this.storageService.getItem(storageKey);
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const isBackupActive = this.authService.isBackupActive();
    const isExpired = isBackupActive ? false : this.isCacheExpired(lastUpdated);

    let parsedPlaylists: any[] = [];
    let isParseError = false;
    if (storedPlaylists) {
      try {
        parsedPlaylists = JSON.parse(storedPlaylists);
      } catch (e) {
        console.warn('Failed to parse cached playlists:', e);
        isParseError = true;
      }
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

        // If it's still 0, try to update it in the background from the API
        if (favPlaylist.tracks.total === 0) {
          this.spotifyDataService.getFavTracks(0, 1).subscribe({
            next: (favTracks: any) => {
              if (favTracks && favTracks.total !== favPlaylist.tracks.total) {
                favPlaylist.tracks.total = favTracks.total;
                this.storageService.setItem(storageKey, JSON.stringify(this.playlists));
                this.filterPlaylists();
              }
            },
            error: (err) => console.log('Background update of fav tracks count failed:', err)
          });
        } else if (updated) {
          this.storageService.setItem(storageKey, JSON.stringify(this.playlists));
        }
      }

      this.filterPlaylists();
    } else {
      const reason = !storedPlaylists ? 'no local cache' : (isExpired ? 'cache expired' : 'unknown');
      console.log(`[Playlists] Cache missing or expired (reason: ${reason}, backup active: ${isBackupActive}). Loading playlists from Spotify API`);
      this.spotifyDataService.getUserPlaylists().subscribe({
        next: (playlists: any) => {
          this.playlists = [...playlists.items];

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

  showClearCacheModal = false;

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  toggleSettingsDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = !this.showSettingsDropdown;
  }

  clearCacheAndLogout() {
    this.showClearCacheModal = true;
  }

  cancelClearCache() {
    this.showClearCacheModal = false;
  }

  confirmClearCache() {
    this.showClearCacheModal = false;
    this.authService.clearCacheAndLogout();
    this.router.navigate(['/login']);
  }

  viewListeningHistory() {
    this.router.navigate(['/history']);
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
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

  showBackupConfirmModal = false;

  onBackupToggle(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.showBackupConfirmModal = true;
    } else {
      this.authService.disableBackup().catch(err => {
        console.error('Failed to disable backup:', err);
      });
    }
  }

  cancelBackupToggle() {
    this.showBackupConfirmModal = false;
  }

  async confirmBackupToggle() {
    this.showBackupConfirmModal = false;
    try {
      await this.authService.enableBackup();
    } catch (err) {
      console.error('Failed to enable backup:', err);
      alert('Failed to enable database backup. Please try again.');
    }
  }
}
