import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, NavigationExtras, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {forkJoin, of} from 'rxjs';
import {catchError} from 'rxjs/operators';


@Component({
  selector: 'app-artists',
  templateUrl: './artists.component.html',
  styleUrls: ['./artists.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ArtistsComponent implements OnInit {
  artists: any[] = [];
  searchText: string = '';
  playlistName: string = '';
  filteredArtists: any[] = [];
  sortAscending: boolean = false;
  playlistId: string = '';
  totalTracks: number = 0;
  isLoading: boolean = false;
  isRefreshing: boolean = false;
  refreshingArtists: any[] = [];
  loadedTracksCount: number = 0;
  cooldownMessage: string = '';
  profilePicUrl: string | null = null;

  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    private authService: SpotifyAuthService
  ) {
    this.route.params.subscribe((params) => {
      this.playlistId = params['id'];
      this.loadArtistsFromPlaylist();
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

  ngOnInit() {
    this.filterArtists();
  }

  loadArtistsFromPlaylist(forceRefresh = false) {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${this.playlistId}`;
    const storedArtists = localStorage.getItem(storageKey);
    const cookieKey = `cooldown_${userId}_${this.playlistId}`;

    if (storedArtists && !forceRefresh) {
      console.log("Loading artists from storage cache");
      const parsedArtists = JSON.parse(storedArtists);
      
      // Self-healing check: if cache lacks images or genres, upgrade cache
      const isOldCache = parsedArtists.length > 0 && (!parsedArtists[0].images || !parsedArtists[0].genres);
      if (isOldCache) {
        console.log("Old cache detected. Upgrading in background.");
        this.loadArtistsFromPlaylist(true);
      } else {
        this.artists = parsedArtists;
        this.artists.sort((a, b) => b.tracks.length - a.tracks.length);
        this.totalTracks = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.filterArtists();
      }
    } else {
      // Check cooldown cookie if we are force-refreshing and have cache
      if (storedArtists && forceRefresh) {
        const expiresAtStr = this.getCookie(cookieKey);
        if (expiresAtStr) {
          const expiresAt = parseInt(expiresAtStr, 10);
          const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
          if (remaining > 0) {
            this.cooldownMessage = `Refreshing is on cooldown. Please wait ${remaining} seconds.`;
            setTimeout(() => this.cooldownMessage = '', 4000);

            // Cooldown protection fallback: load existing cached data instead of showing an empty view
            this.artists = JSON.parse(storedArtists);
            this.artists.sort((a, b) => b.tracks.length - a.tracks.length);
            this.totalTracks = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
            this.playlistName = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Name`) || '""');
            this.filterArtists();
            this.isLoading = false;
            this.isRefreshing = false;
            return;
          }
        }
      }

      console.log("Loading artists from API");
      
      let targetArray: any[];
      if (storedArtists) {
        this.isRefreshing = true;
        this.isLoading = false;
        this.refreshingArtists = [];
        targetArray = this.refreshingArtists;
        this.totalTracks = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Name`) || '""');
      } else {
        this.isRefreshing = false;
        this.isLoading = true;
        this.artists = [];
        targetArray = this.artists;
      }
      this.loadedTracksCount = 0;

      // Set cooldown cookie (e.g. 180 seconds = 3 minutes)
      const cooldownSecs = 180;
      this.setCookie(cookieKey, (Date.now() + cooldownSecs * 1000).toString(), cooldownSecs);

      // If we have cached data and this is fav, perform incremental load of new liked songs
      if (this.playlistId === 'fav' && storedArtists) {
        console.log("Favourite Tracks detected. Starting incremental load.");
        this.loadNewerFavTracks(0, 50, JSON.parse(storedArtists), targetArray);
      } else {
        if (this.playlistId === 'fav') {
          this.playlistName = 'Favourite Tracks';
          this.spotifyDataService.getFavTracks(0, 50).subscribe({
            next: (tracks: any) => {
              this.totalTracks = tracks.total;
              this.getArtistsFromTracks(tracks.items, targetArray);
              this.loadedTracksCount = Math.min(50, this.totalTracks);

              if (this.loadedTracksCount < this.totalTracks) {
                this.loadRemainingTracks(50, 50, this.totalTracks, targetArray);
              } else {
                this.fetchArtistDetailsAndSave(targetArray);
              }
            },
            error: (err) => {
              console.error('Failed to load first page of favourite tracks:', err);
              this.isLoading = false;
              this.isRefreshing = false;
            }
          });
        } else {
          this.spotifyDataService.getSinglePlaylist(this.playlistId).subscribe({
            next: (playlist: any) => {
              this.playlistName = playlist.name;
              this.totalTracks = playlist.tracks.total;
              this.getArtistsFromTracks(playlist.tracks.items, targetArray);
              this.loadedTracksCount = Math.min(100, this.totalTracks);

              if (this.loadedTracksCount < this.totalTracks) {
                this.loadRemainingTracks(100, 100, this.totalTracks, targetArray);
              } else {
                this.fetchArtistDetailsAndSave(targetArray);
              }
            },
            error: (err) => {
              console.error('Failed to load first page of playlist:', err);
              this.isLoading = false;
              this.isRefreshing = false;
            }
          });
        }
      }
    }
  }

  loadRemainingTracks(offset: number, limit: number, total: number, targetArray: any[] = this.artists) {
    if (this.playlistId === 'fav') {
      this.spotifyDataService.getFavTracks(offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(tracks.items, targetArray);
          this.loadedTracksCount = Math.min(offset + limit, total);
          if (this.loadedTracksCount < total) {
            this.loadRemainingTracks(offset + limit, limit, total, targetArray);
          } else {
            this.fetchArtistDetailsAndSave(targetArray);
          }
        },
        error: (err) => {
          console.error('Error loading remaining fav tracks:', err);
          this.fetchArtistDetailsAndSave(targetArray);
        }
      });
    } else {
      this.spotifyDataService.getAllTracksFromPlaylist(this.playlistId, offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(tracks.items, targetArray);
          this.loadedTracksCount = Math.min(offset + limit, total);
          if (this.loadedTracksCount < total) {
            this.loadRemainingTracks(offset + limit, limit, total, targetArray);
          } else {
            this.fetchArtistDetailsAndSave(targetArray);
          }
        },
        error: (err) => {
          console.error('Error loading remaining playlist tracks:', err);
          this.fetchArtistDetailsAndSave(targetArray);
        }
      });
    }
  }

  loadNewerFavTracks(offset: number, limit: number, cachedArtists: any[], targetArray: any[] = this.artists) {
    // Collect all cached track IDs
    const cachedTrackIds = new Set<string>();
    cachedArtists.forEach(artist => {
      artist.tracks.forEach((t: any) => cachedTrackIds.add(t.id));
    });

    this.spotifyDataService.getFavTracks(offset, limit).subscribe({
      next: (tracks: any) => {
        this.totalTracks = tracks.total;
        
        let foundExisting = false;
        const newItems: any[] = [];
        
        for (let item of tracks.items) {
          if (item && item.track) {
            if (cachedTrackIds.has(item.track.id)) {
              foundExisting = true;
              break;
            } else {
              newItems.push(item);
            }
          }
        }
        
        this.getArtistsFromTracks(newItems, targetArray);
        this.loadedTracksCount += newItems.length;

        if (!foundExisting && offset + limit < this.totalTracks) {
          this.loadNewerFavTracks(offset + limit, limit, cachedArtists, targetArray);
        } else {
          // Merge cache, save and finish!
          this.mergeCachedArtists(cachedArtists, targetArray);
          this.fetchArtistDetailsAndSave(targetArray);
        }
      },
      error: (err) => {
        console.error('Incremental loading failed:', err);
        if (targetArray === this.artists) {
          this.artists = cachedArtists;
        }
        this.isLoading = false;
        this.isRefreshing = false;
      }
    });
  }

  mergeCachedArtists(cachedArtists: any[], targetArray: any[] = this.artists) {
    cachedArtists.forEach(cachedArtist => {
      let existingArtist = targetArray.find(a => a.id === cachedArtist.id);
      if (!existingArtist) {
        targetArray.push(cachedArtist);
      } else {
        cachedArtist.tracks.forEach((track: any) => {
          let hasTrack = existingArtist.tracks.some((t: any) => t.id === track.id);
          if (!hasTrack) {
            existingArtist.tracks.push(track);
          }
        });
        if (!existingArtist.images && cachedArtist.images) {
          existingArtist.images = cachedArtist.images;
        }
        if (!existingArtist.genres && cachedArtist.genres) {
          existingArtist.genres = cachedArtist.genres;
        }
      }
    });
  }

  fetchArtistDetailsAndSave(targetArray: any[] = this.artists) {
    const artistIds = targetArray.map(a => a.id);
    const batches: string[][] = [];
    
    for (let i = 0; i < artistIds.length; i += 50) {
      batches.push(artistIds.slice(i, i + 50));
    }

    if (batches.length === 0) {
      this.isLoading = false;
      this.isRefreshing = false;
      if (targetArray !== this.artists) {
        this.artists = targetArray;
      }
      this.setSessionStorage();
      return;
    }

    const requests = batches.map(batch => this.spotifyDataService.getSeveralArtists(batch).pipe(
      catchError(err => {
        console.error('Error fetching batch of artists:', err);
        return of({ artists: [] });
      })
    ));

    forkJoin(requests).subscribe({
      next: (results: any[]) => {
        const allFullArtists = results.reduce((acc, current) => {
          return acc.concat(current.artists || []);
        }, []);

        const artistMap = new Map<string, any>();
        allFullArtists.forEach((a: any) => {
          if (a) artistMap.set(a.id, a);
        });

        targetArray.forEach(artist => {
          const full = artistMap.get(artist.id);
          if (full) {
            artist.images = full.images;
            artist.genres = full.genres;
          }
        });

        this.isLoading = false;
        this.isRefreshing = false;
        if (targetArray !== this.artists) {
          this.artists = targetArray;
        }
        this.setSessionStorage();
      },
      error: (err) => {
        console.error('Error batch fetching artist details:', err);
        this.isLoading = false;
        this.isRefreshing = false;
        if (targetArray !== this.artists) {
          this.artists = targetArray;
        }
        this.setSessionStorage();
      }
    });
  }

  setSessionStorage() {
    this.artists.sort((a, b) => b.tracks.length - a.tracks.length);
    this.filterArtists();
    
    // We clone the array to clean it up for localStorage without mutating the active memory
    const cleanedArtists = JSON.parse(JSON.stringify(this.artists));
    cleanedArtists.forEach((artist: any) => {
      artist.tracks.forEach((track: any) => {
        delete track.artists;
        delete track.album.album_type;
        delete track.album.artists;
        delete track.album.external_urls;
        delete track.album.href;
        delete track.album.is_playable;
        delete track.album.name;
        // Keep track.album.release_date for release year analysis
        delete track.album.release_date_precision;
        delete track.album.total_tracks;
        delete track.album.type;
        delete track.album.uri;
        delete track.available_markets;
        delete track.disc_number;
        // Keep track.duration_ms and track.explicit for length/duration/censorship stats
        delete track.external_ids;
        delete track.href;
        delete track.is_local;
        delete track.preview_url;
        delete track.track_number;
        delete track.type;
        delete track.uri;
        delete track.episode;
        delete track.is_playable;
        delete track.track;
      });
      delete artist.type;
    });

    const userId = this.authService.getUserId() || 'anonymous';
    localStorage.setItem(`${userId}_${this.playlistId}`, JSON.stringify(cleanedArtists));
    localStorage.setItem(`${userId}_${this.playlistId}_Amount`, JSON.stringify(this.totalTracks));
    localStorage.setItem(`${userId}_${this.playlistId}_Name`, JSON.stringify(this.playlistName));
  }

  getArtistsFromTracks(items: any[], targetArray: any[] = this.artists) {
    try {
      for (let item of items) {
        if (!item || !item.track) continue;
        let track = item.track;
        for (let artist of track.artists) {
          let existingArtist = targetArray.find(a => a.id === artist.id);
          if (!existingArtist) {
            artist.tracks = [track];
            targetArray.push(artist);
          } else {
            let existingTrack = existingArtist.tracks.find((t: { id: any }) => t.id === track.id);
            if (!existingTrack) {
              existingArtist.tracks.push(track);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting artists from tracks:', error);
    }
  }

  filterArtists() {
    if (this.searchText.trim() === '') {
      this.filteredArtists = this.artists;
    } else {
      this.filteredArtists = this.artists.filter(artist =>
        artist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }
  }

  goBack() {
    this.router.navigate(['/playlists']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  refreshCache() {
    this.loadArtistsFromPlaylist(true);
  }

  artistDetails(id: string) {
    const tracks = this.artists.find(artist => artist.id === id)?.tracks || [];

    const navigationExtras: NavigationExtras = {
      state: {
        tracks: tracks,
        playlistId: this.playlistId
      }
    };

    this.router.navigate(['/artistDetails', id], navigationExtras);
  }

  sortArtistsByTracks() {
    if (this.sortAscending) {
      this.filteredArtists.sort((a, b) => b.tracks.length - a.tracks.length);
    } else {
      this.filteredArtists.sort((a, b) => a.tracks.length - b.tracks.length);
    }
    this.sortAscending = !this.sortAscending;
  }

  getCookie(name: string): string | null {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  setCookie(name: string, value: string, maxAgeSeconds: number) {
    document.cookie = `${name}=${value}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax; Secure`;
  }
}
