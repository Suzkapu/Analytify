import {Component, OnInit, OnDestroy, ViewEncapsulation, HostListener} from '@angular/core';
import {ActivatedRoute, NavigationExtras, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";
import {PlaylistLoaderService} from "../../services/playlist-loader/playlist-loader.service";
import {forkJoin, of, Subscription} from 'rxjs';
import {catchError} from 'rxjs/operators';

@Component({
  selector: 'app-songs',
  templateUrl: './songs.component.html',
  styleUrls: ['./songs.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class SongsComponent implements OnInit, OnDestroy {
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
  private loaderSubscription: Subscription | null = null;

  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private playlistLoaderService: PlaylistLoaderService
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

    const isBackupActive = this.authService.isBackupActive();
    const isExpired = this.isCacheExpired(lastUpdated);
    const version = this.storageService.getItem(`${userId}_${this.playlistId}_cacheVersion`);

    // Unsubscribe from any previous loader task
    if (this.loaderSubscription) {
      this.loaderSubscription.unsubscribe();
      this.loaderSubscription = null;
    }

    // Check if there is an active background task running for this playlist
    const activeTask = this.playlistLoaderService.getLoadingTask(this.playlistId);

    if (activeTask) {
      this.subscribeToLoaderTask(activeTask);
      return;
    }

    let parsedArtists: any[] = [];
    let isParseError = false;
    if (storedArtists) {
      try {
        parsedArtists = JSON.parse(storedArtists);
      } catch (e) {
        console.warn('Failed to parse stored artists:', e);
        isParseError = true;
      }
    }

    if (storedArtists && !isExpired && version === 'v4' && !isParseError) {
      console.log(isBackupActive ? `[Songs] Loading playlist ${this.playlistId} contents from Supabase Cloud Backup (Local Cache)` : `[Songs] Loading playlist ${this.playlistId} contents from Local Storage Cache (Cloud Backup disabled)`);
      try {
        this.artists = parsedArtists;
        this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.filterArtists();
      } catch (e) {
        console.warn('Failed to parse some cached playlist keys:', e);
        this.loadPlaylistFromAPI(userId, isBackupActive, isExpired);
      }
    } else {
      this.loadPlaylistFromAPI(userId, isBackupActive, isExpired, storedArtists, parsedArtists);
    }
  }

  private loadPlaylistFromAPI(userId: string, isBackupActive: boolean, isExpired: boolean, storedArtists?: string | null, parsedArtists?: any[]) {
    // Start a new loading task
    const isRefresh = !!storedArtists && parsedArtists && parsedArtists.length > 0;
    const version = this.storageService.getItem(`${userId}_${this.playlistId}_cacheVersion`);
    const reason = !storedArtists ? 'no local cache' : (version !== 'v4' ? `old cache version (${version})` : (isExpired ? 'cache expired' : 'unknown'));
    console.log(`[Songs] Cache missing or stale for playlist ${this.playlistId} (reason: ${reason}, backup active: ${isBackupActive}). Loading from API.`);
    if (isRefresh && parsedArtists) {
      try {
        this.artists = parsedArtists;
        this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.filterArtists();
      } catch (e) {
        console.warn('Failed to load temporary data from cache:', e);
      }
    }
    const task = this.playlistLoaderService.startLoadingTask(userId, this.playlistId, isRefresh, isExpired);
    this.subscribeToLoaderTask(task);
  }

  private subscribeToLoaderTask(task: any) {
    this.loaderSubscription = task.progress$.subscribe((progress: any) => {
      this.isLoading = (progress.isLoadingTracks || progress.isLoadingArtists) && !progress.isRefreshing && progress.artists.length === 0;
      this.isLoadingTracks = progress.isLoadingTracks;
      this.isLoadingArtists = progress.isLoadingArtists;
      this.isRefreshing = progress.isRefreshing;
      this.loadedTracksCount = progress.loadedTracksCount;
      this.totalTracks = progress.totalTracks;
      this.loadedArtistsDetailsCount = progress.loadedArtistsDetailsCount;
      this.totalUniqueArtists = progress.totalUniqueArtists;
      this.playlistName = progress.playlistName;
      this.cooldownMessage = progress.cooldownMessage;

      if (progress.isComplete) {
        const userId = this.authService.getUserId() || 'anonymous';
        const storedArtists = this.storageService.getItem(`${userId}_${this.playlistId}`);
        if (storedArtists) {
          this.artists = JSON.parse(storedArtists);
          this.filterArtists();
        }
        this.playlistLoaderService.clearLoadingTask(this.playlistId);
        if (this.loaderSubscription) {
          this.loaderSubscription.unsubscribe();
          this.loaderSubscription = null;
        }
      } else {
        this.artists = progress.isRefreshing ? this.artists : progress.artists;
        this.filterArtists();
      }
    });
  }

  ngOnDestroy() {
    if (this.loaderSubscription) {
      this.loaderSubscription.unsubscribe();
      this.loaderSubscription = null;
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

  showClearCacheModal = false;
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
            const trackName = track.name;
            const trackArtists = track.artists || [];
            const hasValidArtists = trackArtists.length > 0 && trackArtists.some((a: any) => a && a.name && a.name.trim() !== '');
            
            if (!trackName || trackName.trim() === '' || !hasValidArtists) {
              return; // skip this track
            }

            if (!tracksMap.has(track.id)) {
              let finalArtists = track.artists;
              if (!finalArtists || finalArtists.length === 0) {
                finalArtists = [{ id: artist.id, name: artist.name }];
              }
              
              // Pre-calculate timestamp to avoid parsing in sort comparator
              let addedAtTime = 0;
              if (track.added_at) {
                const parsed = new Date(track.added_at).getTime();
                if (!isNaN(parsed)) {
                  addedAtTime = parsed;
                }
              }

              tracksMap.set(track.id, {
                ...track,
                artists: finalArtists,
                added_at_time: addedAtTime
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
          const dateA = a.added_at_time || 0;
          const dateB = b.added_at_time || 0;
          if (dateA !== dateB) {
            comparison = dateA - dateB;
          } else {
            // For fav, playlist_index 1 is the newest, so to sort oldest first:
            // index N first, then index 1 (descending values).
            // For standard, playlist_index 1 is the oldest, so to sort oldest first:
            // index 1 first, then index N (ascending values).
            const idxA = a.playlist_index || 0;
            const idxB = b.playlist_index || 0;
            if (this.playlistId === 'fav') {
              comparison = idxB - idxA;
            } else {
              comparison = idxA - idxB;
            }
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
