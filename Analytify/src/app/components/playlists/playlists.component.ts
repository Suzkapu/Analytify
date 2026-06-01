import {Component, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";

@Component({
  selector: 'app-playlists', templateUrl: './playlists.component.html', styleUrls: ['./playlists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PlaylistsComponent {
  playlists: any[] = [];
  filteredPlaylists: any[] = [];
  searchText: string = '';
  profilePicUrl: string | null = null;

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService
  ) {
    this.route.params.subscribe(() => {
      this.loadPlaylists();
      this.loadUserProfile();
    });
  }

  loadUserProfile() {
    const cached = sessionStorage.getItem('spotify_profile_pic');
    if (cached !== null) {
      this.profilePicUrl = cached || null;
    } else {
      this.spotifyDataService.getCurrentUser().subscribe({
        next: (user: any) => {
          const pic = user.images && user.images[0] ? user.images[0].url : '';
          sessionStorage.setItem('spotify_profile_pic', pic);
          this.profilePicUrl = pic || null;
        },
        error: (err) => console.error('Failed to load user profile:', err)
      });
    }
  }

  loadPlaylists() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_playlists`;
    const storedPlaylists = localStorage.getItem(storageKey);

    if (storedPlaylists) {
      console.log("from storage")
      this.playlists = JSON.parse(storedPlaylists);
      this.filterPlaylists();

      // Refresh Favourite Tracks count dynamically in the background
      this.spotifyDataService.getFavTracks(0, 1).subscribe({
        next: (favTracks: any) => {
          const fav = this.playlists.find(p => p.id === 'fav');
          if (fav) {
            fav.tracks = { total: favTracks.total };
            localStorage.setItem(storageKey, JSON.stringify(this.playlists));
            this.filterPlaylists();
          }
        },
        error: (err) => {
          console.error('Failed to update favourite tracks count dynamically', err);
        }
      });
    } else {
      console.log("from api")
      this.spotifyDataService.getUserPlaylists().subscribe((playlists: any) => {
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
            localStorage.setItem(storageKey, JSON.stringify(this.playlists));
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
            localStorage.setItem(storageKey, JSON.stringify(this.playlists));
            this.filterPlaylists();
          }
        });
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
      this.filteredPlaylists = this.playlists;
    } else {
      this.filteredPlaylists = this.playlists.filter(playlist =>
        playlist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }
  }

  viewArtists(playlistId: string) {
    this.router.navigate(['/artists', playlistId]);
  }
}
