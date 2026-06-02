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
  profilePicUrl: string | null = null;
  isSortedByCount: boolean = false;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private storageService: StorageService
  ) {
    this.route.params.subscribe(() => {
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

  loadPlaylists() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_playlists`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const storedPlaylists = this.storageService.getItem(storageKey);
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const oneDay = 24 * 60 * 60 * 1000;
    const isExpired = !lastUpdated || (Date.now() - parseInt(lastUpdated, 10) > oneDay);

    if (storedPlaylists && !isExpired) {
      console.log("from storage");
      this.playlists = JSON.parse(storedPlaylists);
      this.filterPlaylists();
    } else {
      console.log("from api");
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  viewAnalysis(playlistId: string) {
    this.router.navigate(['/analysis', playlistId]);
  }

  filterPlaylists() {
    if (this.searchText.trim() === '') {
      this.filteredPlaylists = [...this.playlists];
    } else {
      this.filteredPlaylists = this.playlists.filter(playlist =>
        playlist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }

    if (this.isSortedByCount) {
      this.filteredPlaylists.sort((a, b) => {
        const countA = a.tracks ? a.tracks.total : 0;
        const countB = b.tracks ? b.tracks.total : 0;
        return countB - countA;
      });
    }
  }

  sortPlaylistsByTracks() {
    this.isSortedByCount = !this.isSortedByCount;
    this.filterPlaylists();
  }

  viewArtists(playlistId: string) {
    this.router.navigate(['/artists', playlistId]);
  }
}
