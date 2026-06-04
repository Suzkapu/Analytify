import {Component, OnInit, ViewEncapsulation, HostListener} from '@angular/core';
import {ActivatedRoute, NavigationExtras, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";
import {forkJoin, of} from 'rxjs';
import {catchError} from 'rxjs/operators';

@Component({
  selector: 'app-songs',
  templateUrl: './songs.component.html',
  styleUrls: ['./songs.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class SongsComponent implements OnInit {
  artists: any[] = [];
  searchText: string = '';
  playlistName: string = '';
  filteredArtists: any[] = [];
  sortOrder: 'asc' | 'desc' | 'none' = 'none';
  playlistId: string = '';
  totalTracks: number = 0;
  isLoading: boolean = false;
  isRefreshing: boolean = false;
  refreshingArtists: any[] = [];
  loadedTracksCount: number = 0;
  cooldownMessage: string = '';
  profilePicUrl: string | null = null;
  showSettingsDropdown: boolean = false;

  // View switcher and tracks listing properties
  viewStyle: 'artists' | 'songs' = 'artists';
  playlistTracks: any[] = [];
  filteredTracks: any[] = [];
  trackSearchText: string = '';
  trackSortKey: string = 'recently_added';
  sortAscending: boolean = false;
  showSortMenu: boolean = false;
  sortOptions = [
    { value: 'recently_added', label: 'Recently added' },
    { value: 'popularity', label: 'Popularity' },
    { value: 'duration', label: 'Duration' },
    { value: 'release', label: 'Release Date' },
    { value: 'name', label: 'Alphabetical' }
  ];
  trackIndexCounter: number = 0;
  displayedArtistsCount: number = 50;
  displayedTracksCount: number = 50;

  // Real-time progress properties
  isLoadingTracks: boolean = false;
  isLoadingArtists: boolean = false;
  loadedArtistsDetailsCount: number = 0;
  totalUniqueArtists: number = 0;
  private requestedArtistIds = new Set<string>();

  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    private authService: SpotifyAuthService,
    private storageService: StorageService
  ) {
    this.route.params.subscribe((params) => {
      this.playlistId = params['id'];
      this.sortAscending = this.getDefaultSortDirection(this.trackSortKey);
      const userId = this.authService.getUserId() || 'anonymous';
      this.sortOrder = (this.storageService.getItem(`${userId}_artists_sortOrder`) as 'asc' | 'desc' | 'none') || 'none';
      this.loadArtistsFromPlaylist();
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

  ngOnInit() {
    this.filterArtists();
  }

  loadArtistsFromPlaylist() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${this.playlistId}`;
    const storedArtists = this.storageService.getItem(storageKey);
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const isExpired = this.isCacheExpired(lastUpdated);

    if (storedArtists && !isExpired) {
      console.log("Loading artists from storage cache");
      const parsedArtists = JSON.parse(storedArtists);
      
      this.artists = parsedArtists;
      let maxIdx = 0;
      parsedArtists.forEach((artist: any) => {
        if (artist.tracks) {
          artist.tracks.forEach((t: any) => {
            if (t.playlist_index > maxIdx) {
              maxIdx = t.playlist_index;
            }
          });
        }
      });
      this.trackIndexCounter = maxIdx;

      this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
      this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
      this.filterArtists();

      // Self-healing check: if cache lacks images, genres, or is outdated version, upgrade cache
      const version = this.storageService.getItem(`${userId}_${this.playlistId}_cacheVersion`);
      const isOldCache = parsedArtists.length > 0 && (!parsedArtists[0].images || !parsedArtists[0].genres || version !== 'v2');
      if (isOldCache) {
        console.log("Old cache version detected. Upgrading in background.");
        this.triggerApiLoad(true);
      }
    } else {
      if (storedArtists) {
        this.artists = JSON.parse(storedArtists);
        let maxIdx = 0;
        this.artists.forEach((artist: any) => {
          if (artist.tracks) {
            artist.tracks.forEach((t: any) => {
              if (t.playlist_index > maxIdx) {
                maxIdx = t.playlist_index;
              }
            });
          }
        });
        this.trackIndexCounter = maxIdx;

        this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.filterArtists();
      }
      this.triggerApiLoad(!!storedArtists);
    }
  }

  triggerApiLoad(isBackgroundRefresh: boolean) {
    console.log("Loading artists from API");
    const userId = this.authService.getUserId() || 'anonymous';
    this.requestedArtistIds.clear();
    this.loadedArtistsDetailsCount = 0;
    this.totalUniqueArtists = 0;

    let targetArray: any[];
    
    if (isBackgroundRefresh) {
      this.isRefreshing = true;
      this.isLoading = false;
      this.refreshingArtists = [];
      targetArray = this.refreshingArtists;
      this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
      this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
      
      let maxIdx = 0;
      this.artists.forEach((artist: any) => {
        if (artist.tracks) {
          artist.tracks.forEach((t: any) => {
            if (t.playlist_index > maxIdx) {
              maxIdx = t.playlist_index;
            }
          });
        }
      });
      this.trackIndexCounter = maxIdx;
    } else {
      this.isRefreshing = false;
      this.isLoading = true;
      this.artists = [];
      targetArray = this.artists;
      this.trackIndexCounter = 0;
    }
    
    this.isLoadingTracks = true;
    this.isLoadingArtists = true;
    this.loadedTracksCount = 0;

    const storedArtists = this.storageService.getItem(`${userId}_${this.playlistId}`);
    const version = this.storageService.getItem(`${userId}_${this.playlistId}_cacheVersion`);
    const isOldCache = storedArtists && version !== 'v2';

    if (this.playlistId === 'fav' && storedArtists && !isOldCache) {
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
            
            // First page is loaded, we can now display the screen
            this.isLoading = false;
            this.filterArtists();

            // Fire off lazy loader for artist details in background
            this.fetchArtistDetailsLazy(targetArray);

            if (this.loadedTracksCount < this.totalTracks) {
              this.loadRemainingTracks(50, 50, this.totalTracks, targetArray);
            } else {
              this.isLoadingTracks = false;
              this.checkCompletion();
            }
          },
          error: (err) => {
            console.error('Failed to load first page of favourite tracks:', err);
            this.isLoading = false;
            this.isLoadingTracks = false;
            this.isLoadingArtists = false;
          }
        });
      } else {
        this.spotifyDataService.getSinglePlaylist(this.playlistId).subscribe({
          next: (playlist: any) => {
            this.playlistName = playlist.name;
            this.totalTracks = playlist.tracks.total;
            this.getArtistsFromTracks(playlist.tracks.items, targetArray);
            this.loadedTracksCount = Math.min(100, this.totalTracks);
            
            // First page is loaded, we can now display the screen
            this.isLoading = false;
            this.filterArtists();

            // Fire off lazy loader for artist details in background
            this.fetchArtistDetailsLazy(targetArray);

            if (this.loadedTracksCount < this.totalTracks) {
              this.loadRemainingTracks(100, 100, this.totalTracks, targetArray);
            } else {
              this.isLoadingTracks = false;
              this.checkCompletion();
            }
          },
          error: (err) => {
            console.error('Failed to load first page of playlist:', err);
            this.isLoading = false;
            this.isLoadingTracks = false;
            this.isLoadingArtists = false;
          }
        });
      }
    }
  }

  loadRemainingTracks(offset: number, limit: number, total: number, targetArray: any[] = this.artists) {
    if (this.playlistId === 'fav') {
      this.spotifyDataService.getFavTracks(offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(tracks.items, targetArray);
          this.loadedTracksCount = Math.min(offset + limit, total);
          
          this.filterArtists();
          this.fetchArtistDetailsLazy(targetArray);

          if (this.loadedTracksCount < total) {
            this.loadRemainingTracks(offset + limit, limit, total, targetArray);
          } else {
            this.isLoadingTracks = false;
            this.checkCompletion();
          }
        },
        error: (err) => {
          console.error('Error loading remaining fav tracks:', err);
          this.isLoadingTracks = false;
          this.checkCompletion();
        }
      });
    } else {
      this.spotifyDataService.getAllTracksFromPlaylist(this.playlistId, offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(tracks.items, targetArray);
          this.loadedTracksCount = Math.min(offset + limit, total);
          
          this.filterArtists();
          this.fetchArtistDetailsLazy(targetArray);

          if (this.loadedTracksCount < total) {
            this.loadRemainingTracks(offset + limit, limit, total, targetArray);
          } else {
            this.isLoadingTracks = false;
            this.checkCompletion();
          }
        },
        error: (err) => {
          console.error('Error loading remaining playlist tracks:', err);
          this.isLoadingTracks = false;
          this.checkCompletion();
        }
      });
    }
  }

  loadNewerFavTracks(offset: number, limit: number, cachedArtists: any[], targetArray: any[] = this.artists) {
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

        this.isLoading = false;
        this.filterArtists();
        this.fetchArtistDetailsLazy(targetArray);

        if (!foundExisting && offset + limit < this.totalTracks) {
          this.loadNewerFavTracks(offset + limit, limit, cachedArtists, targetArray);
        } else {
          this.mergeCachedArtists(cachedArtists, targetArray);
          this.isLoadingTracks = false;
          this.fetchArtistDetailsLazy(targetArray);
          this.checkCompletion();
        }
      },
      error: (err) => {
        console.error('Incremental loading failed:', err);
        if (targetArray === this.artists) {
          this.artists = cachedArtists;
        }
        this.isLoading = false;
        this.isLoadingTracks = false;
        this.isLoadingArtists = false;
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

  fetchArtistDetailsLazy(targetArray: any[]) {
    // Collect unique artist IDs that are not yet requested
    const pendingIds = targetArray
      .map(a => a.id)
      .filter(id => !this.requestedArtistIds.has(id));

    if (pendingIds.length === 0) {
      this.checkCompletion();
      return;
    }

    // Pull 50 artists at a time
    const batch = pendingIds.slice(0, 50);
    batch.forEach(id => this.requestedArtistIds.add(id));

    this.isLoadingArtists = true;

    this.spotifyDataService.getSeveralArtists(batch).subscribe({
      next: (res: any) => {
        const artistMap = new Map<string, any>();
        (res.artists || []).forEach((a: any) => {
          if (a) artistMap.set(a.id, a);
        });

        targetArray.forEach(artist => {
          if (artistMap.has(artist.id)) {
            const full = artistMap.get(artist.id);
            artist.images = full.images || [];
            artist.genres = full.genres || [];
          }
        });

        // Calculate how many unique artists now have details loaded
        this.loadedArtistsDetailsCount = targetArray.filter(a => a.images && a.images.length > 0).length;
        
        this.filterArtists();
        
        // Load next batch
        this.fetchArtistDetailsLazy(targetArray);
      },
      error: (err) => {
        console.error('Error batch loading artists lazy details:', err);
        // Continue queue despite individual batch error
        this.fetchArtistDetailsLazy(targetArray);
      }
    });
  }

  checkCompletion() {
    if (!this.isLoadingTracks && this.requestedArtistIds.size >= this.totalUniqueArtists) {
      this.isLoadingArtists = false;
      
      // Ensure target array is assigned correctly before saving
      if (this.isRefreshing) {
        this.artists = this.refreshingArtists;
        this.isRefreshing = false;
      }
      
      this.setSessionStorage();
    }
  }

  setSessionStorage() {
    this.filterArtists();
    
    // Explicitly map only the required fields to drastically reduce the storage payload size
    const cleanedArtists = this.artists.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      images: artist.images ? artist.images.map((img: any) => ({ url: img.url })) : [],
      genres: artist.genres || [],
      tracks: artist.tracks ? artist.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        artists: track.artists ? track.artists.map((a: any) => ({ id: a.id, name: a.name })) : [],
        popularity: track.popularity,
        explicit: track.explicit,
        duration_ms: track.duration_ms,
        external_urls: track.external_urls ? { spotify: track.external_urls.spotify } : undefined,
        added_at: track.added_at,
        playlist_index: track.playlist_index,
        album: track.album ? {
          images: track.album.images ? track.album.images.map((img: any) => ({ url: img.url })) : [],
          release_date: track.album.release_date
        } : undefined
      })) : []
    }));

    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.setItem(`${userId}_${this.playlistId}`, JSON.stringify(cleanedArtists));
    this.storageService.setItem(`${userId}_${this.playlistId}_Amount`, JSON.stringify(this.totalTracks));
    this.storageService.setItem(`${userId}_${this.playlistId}_Name`, JSON.stringify(this.playlistName));
    this.storageService.setItem(`${userId}_${this.playlistId}_lastUpdated`, Date.now().toString());
    this.storageService.setItem(`${userId}_${this.playlistId}_cacheVersion`, 'v2');
  }

  getArtistsFromTracks(items: any[], targetArray: any[] = this.artists) {
    try {
      for (let item of items) {
        if (!item || !item.track) continue;
        let track = item.track;
        track.added_at = item.added_at || '';
        if (!track.playlist_index) {
          track.playlist_index = ++this.trackIndexCounter;
        }
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
      this.totalUniqueArtists = targetArray.length;
    } catch (error) {
      console.error('Error getting artists from tracks:', error);
    }
  }

  filterArtists() {
    this.displayedArtistsCount = 50;
    if (this.searchText.trim() === '') {
      this.filteredArtists = [...this.artists];
    } else {
      this.filteredArtists = this.artists.filter(artist =>
        artist.name.toLowerCase().includes(this.searchText.toLowerCase())
      );
    }

    if (this.sortOrder === 'desc') {
      this.filteredArtists.sort((a, b) => b.tracks.length - a.tracks.length);
    } else if (this.sortOrder === 'asc') {
      this.filteredArtists.sort((a, b) => a.tracks.length - b.tracks.length);
    }
    this.updatePlaylistTracks();
  }

  goBack() {
    this.router.navigate(['/playlists']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  toggleSettingsDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = !this.showSettingsDropdown;
  }

  clearCacheAndLogout() {
    this.authService.clearCacheAndLogout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
    this.showSortMenu = false;
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

  onSortOrderChange() {
    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.setItem(`${userId}_artists_sortOrder`, this.sortOrder);
    this.filterArtists();
  }

  sortArtistsByTracks() {
    if (this.sortOrder === 'none') {
      this.sortOrder = 'desc';
    } else if (this.sortOrder === 'desc') {
      this.sortOrder = 'asc';
    } else {
      this.sortOrder = 'none';
    }
    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.setItem(`${userId}_artists_sortOrder`, this.sortOrder);
    this.filterArtists();
  }

  updatePlaylistTracks() {
    const tracksMap = new Map<string, any>();
    this.artists.forEach(artist => {
      if (artist.tracks) {
        artist.tracks.forEach((track: any) => {
          if (track && track.id) {
            if (!tracksMap.has(track.id)) {
              let trackArtists = track.artists;
              if (!trackArtists || trackArtists.length === 0) {
                trackArtists = [{ id: artist.id, name: artist.name }];
              }
              tracksMap.set(track.id, {
                ...track,
                artists: trackArtists
              });
            } else {
              const existing = tracksMap.get(track.id);
              if (existing && existing.artists) {
                const hasArtist = existing.artists.some((a: any) => a.id === artist.id);
                if (!hasArtist) {
                  existing.artists.push({ id: artist.id, name: artist.name });
                }
              }
            }
          }
        });
      }
    });
    this.playlistTracks = Array.from(tracksMap.values());
    this.filterAndSortTracks();
  }

  filterAndSortTracks() {
    this.displayedTracksCount = 50;
    let result = [...this.playlistTracks];

    if (this.trackSearchText && this.trackSearchText.trim() !== '') {
      const query = this.trackSearchText.toLowerCase().trim();
      result = result.filter(track =>
        (track.name && track.name.toLowerCase().includes(query)) ||
        (track.artists && track.artists.some((a: any) => a.name.toLowerCase().includes(query)))
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (this.trackSortKey) {
        case 'recently_added': {
          const dateA = a.added_at ? new Date(a.added_at).getTime() : 0;
          const dateB = b.added_at ? new Date(b.added_at).getTime() : 0;
          if (dateA !== dateB) {
            comparison = dateA - dateB;
          } else {
            comparison = (a.playlist_index || 0) - (b.playlist_index || 0);
          }
          break;
        }
        case 'popularity':
          comparison = (a.popularity || 0) - (b.popularity || 0);
          break;
        case 'duration':
          comparison = (a.duration_ms || 0) - (b.duration_ms || 0);
          break;
        case 'release': {
          const dateA = a.album?.release_date || '';
          const dateB = b.album?.release_date || '';
          comparison = dateA.localeCompare(dateB);
          break;
        }
        case 'name': {
          const nameA = a.name || '';
          const nameB = b.name || '';
          comparison = nameA.localeCompare(nameB);
          break;
        }
        default:
          comparison = 0;
      }
      return this.sortAscending ? comparison : -comparison;
    });

    this.filteredTracks = result;
  }

  getSortLabel(): string {
    const opt = this.sortOptions.find(o => o.value === this.trackSortKey);
    return opt ? opt.label : 'Recently added';
  }

  toggleSortMenu(event: Event) {
    event.stopPropagation();
    this.showSortMenu = !this.showSortMenu;
  }

  getDefaultSortDirection(category: string): boolean {
    if (category === 'recently_added') {
      return this.playlistId !== 'fav';
    }
    if (category === 'popularity') {
      return false; // highest popularity first by default
    }
    return true; // ascending A-Z / oldest release / shortest duration
  }

  selectSortCategory(category: string, event: Event) {
    event.stopPropagation();
    if (this.trackSortKey === category) {
      this.sortAscending = !this.sortAscending;
    } else {
      this.trackSortKey = category;
      this.sortAscending = this.getDefaultSortDirection(category);
      this.showSortMenu = false;
    }
    this.filterAndSortTracks();
  }

  formatDurationShort(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  getYearFromDate(dateStr: string): string {
    if (!dateStr) return 'Unknown';
    return dateStr.substring(0, 4);
  }

  openTrackClick(url: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const threshold = 300; // 300px before bottom
    const position = (window.innerHeight + window.scrollY);
    const height = document.documentElement.scrollHeight;
    
    if (position >= height - threshold) {
      if (this.viewStyle === 'artists') {
        if (this.displayedArtistsCount < this.filteredArtists.length) {
          this.displayedArtistsCount += 50;
        }
      } else {
        if (this.displayedTracksCount < this.filteredTracks.length) {
          this.displayedTracksCount += 50;
        }
      }
    }
  }
}
