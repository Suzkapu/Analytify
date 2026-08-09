import {Component, OnInit, OnDestroy, ViewEncapsulation, HostListener, NgZone} from '@angular/core';
import {ActivatedRoute, NavigationExtras, Router} from "@angular/router";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {PlaylistLoaderService} from "@core/sync/playlist-loader/playlist-loader.service";
import {ImageHealingService} from "@core/sync/image-healing/image-healing.service";
import {Subscription} from 'rxjs';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Songs');

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

  // View switcher and tracks listing properties
  viewStyle: 'artists' | 'songs' | 'albums' = 'artists';
  playlistTracks: any[] = [];
  filteredTracks: any[] = [];
  playlistAlbums: any[] = [];
  filteredAlbums: any[] = [];
  selectedAlbum: any | null = null;
  private albumListScrollPosition = 0;
  trackSearchText: string = '';
  albumSearchText: string = '';
  albumSortOrder: 'asc' | 'desc' = 'desc';
  trackSortKey: string = 'recently_added';
  sortAscending: boolean = false;
  showSortMenu: boolean = false;
  sortOptions = [
    { value: 'recently_added', label: 'Recently added' },
    { value: 'duration', label: 'Duration' },
    { value: 'release', label: 'Release Date' },
    { value: 'name', label: 'Alphabetical' }
  ];
  trackIndexCounter: number = 0;
  displayedArtistsCount: number = 50;
  displayedTracksCount: number = 50;
  displayedAlbumsCount: number = 50;

  // Real-time progress properties
  isLoadingTracks: boolean = false;
  isLoadingArtists: boolean = false;
  loadedArtistsDetailsCount: number = 0;
  totalUniqueArtists: number = 0;
  private loaderSubscription: Subscription | null = null;
  private readonly windowScrollHandler = () => this.onWindowScroll();

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private playlistLoaderService: PlaylistLoaderService,
    private imageHealingService: ImageHealingService,
    private ngZone: NgZone
  ) {
    this.route.params.subscribe(async (params) => {
      this.playlistId = params['id'];
      this.sortAscending = this.getDefaultSortDirection(this.trackSortKey);
      const userId = this.authService.getUserId() || 'anonymous';
      this.sortOrder = (this.storageService.getItem(`${userId}_artists_sortOrder`) as 'asc' | 'desc' | 'none') || 'none';
      this.albumSortOrder =
        this.storageService.getItem(`${userId}_albums_sortOrder`) === 'asc' ? 'asc' : 'desc';
      if (this.authService.isAuthenticated()) {
        await this.authService.ensureInitialSync();
      }
      await this.loadArtistsFromPlaylist();
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

  ngOnInit() {
    this.filterArtists();
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.windowScrollHandler, {passive: true});
    });
  }

  private readPlaylistCache(userId: string, storageKey: string) {
    const storedArtists = this.storageService.getItem(storageKey);
    const lastUpdated = this.storageService.getItem(`${storageKey}_lastUpdated`);
    let parsedArtists: any[] = [];
    let isParseError = false;
    let cachedTotalTracks = 0;
    let cachedTrackCount: number | null = null;
    const sourceManifest = this.playlistLoaderService.readSourceManifest(userId, this.playlistId);
    const sourceDirty = this.playlistLoaderService.isPlaylistSourceDirty(userId, this.playlistId);

    if (storedArtists) {
      try {
        const parsed = JSON.parse(storedArtists);
        if (!Array.isArray(parsed)) {
          isParseError = true;
        } else {
          parsedArtists = parsed;
        }

        const amountStr = this.storageService.getItem(`${storageKey}_Amount`);
        if (amountStr) {
          const parsedAmount = JSON.parse(amountStr);
          cachedTotalTracks =
            Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;
        }
        cachedTotalTracks = this.playlistLoaderService.resolveExpectedPlaylistTotal(
          userId,
          this.playlistId,
          cachedTotalTracks
        );

        const cachedTrackCountStr =
          this.storageService.getItem(`${storageKey}_CachedTrackCount`);
        if (cachedTrackCountStr !== null) {
          const parsedCachedTrackCount = JSON.parse(cachedTrackCountStr);
          if (Number.isFinite(parsedCachedTrackCount) && parsedCachedTrackCount >= 0) {
            cachedTrackCount = parsedCachedTrackCount;
          }
        }

      } catch (e) {
        console.warn('Failed to parse stored artists:', e);
        isParseError = true;
      }
    }

    const isComplete = !isParseError && this.playlistLoaderService.isCachedPlaylistComplete(
      parsedArtists,
      cachedTotalTracks,
      cachedTrackCount,
      sourceManifest
    );

    return {
      storedArtists,
      parsedArtists,
      cachedTotalTracks,
      cachedTrackCount,
      sourceManifest,
      sourceDirty,
      isExpired: this.isCacheExpired(lastUpdated),
      isParseError,
      isComplete,
      needsCloudRestore: !storedArtists ||
        this.isCacheExpired(lastUpdated) ||
        isParseError ||
        !isComplete,
      isUsable: !!storedArtists &&
        !this.isCacheExpired(lastUpdated) &&
        !sourceDirty &&
        !isParseError &&
        isComplete
    };
  }

  async loadArtistsFromPlaylist() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${this.playlistId}`;
    const isBackupActive = this.authService.isBackupActive();

    // Unsubscribe from any previous loader task
    if (this.loaderSubscription) {
      this.loaderSubscription.unsubscribe();
      this.loaderSubscription = null;
    }

    // Check if there is an active background task running for this playlist
    const activeTask = this.playlistLoaderService.getLoadingTask(this.playlistId);

    if (activeTask) {
      const activeCache = this.readPlaylistCache(userId, storageKey);
      if (activeCache.storedArtists) {
        try {
          this.artists = activeCache.parsedArtists;
          this.totalTracks = activeCache.cachedTotalTracks;
          this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
          this.filterArtists();
        } catch (e) {
          console.warn('Failed to parse stored artists for active task:', e);
        }
      }
      this.subscribeToLoaderTask(
        activeTask,
        activeTask.mode === 'incremental-new-only'
      );
      return;
    }

    let cache = this.readPlaylistCache(userId, storageKey);
    if (cache.needsCloudRestore && isBackupActive) {
      // The cloud cache owns its own consistency marker. Do not retain a local
      // marker when replacing the serialized dataset from Supabase.
      this.storageService.removeItem(`${storageKey}_CachedTrackCount`);
      this.storageService.removeItem(
        this.playlistLoaderService.sourceManifestKey(userId, this.playlistId)
      );
      await this.storageService.restoreItemsFromCloud([
        storageKey,
        `${storageKey}_Amount`,
        `${storageKey}_Name`,
        `${storageKey}_CachedTrackCount`,
        this.playlistLoaderService.sourceManifestKey(userId, this.playlistId),
        `${storageKey}_lastUpdated`
      ]);
      cache = this.readPlaylistCache(userId, storageKey);
    }

    if (cache.isUsable) {
      console.log(`[Songs] Loading playlist ${this.playlistId} contents from the local IndexedDB cache.`);
      try {
        this.artists = cache.parsedArtists;
        this.totalTracks = cache.cachedTotalTracks;
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.filterArtists();
        this.healVisibleArtistImages();
      } catch (e) {
        console.warn('Failed to parse some cached playlist keys:', e);
        this.loadPlaylistFromAPI(userId, isBackupActive, cache.isExpired);
      }
    } else {
      this.loadPlaylistFromAPI(
        userId,
        isBackupActive,
        cache.isExpired,
        cache.storedArtists,
        cache.parsedArtists,
        !cache.isComplete,
        !!cache.sourceManifest
      );
    }
  }

  private loadPlaylistFromAPI(
    userId: string,
    isBackupActive: boolean,
    isExpired: boolean,
    storedArtists?: string | null,
    parsedArtists?: any[],
    isIncomplete: boolean = false,
    hasSourceManifest: boolean = false
  ) {
    // Start a new loading task
    const isRefresh = !!storedArtists && parsedArtists && parsedArtists.length > 0;
    const reason = !storedArtists
      ? 'no local cache'
      : (isIncomplete ? 'incomplete cache' : (isExpired ? 'cache expired' : 'invalid cache'));
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
    const task = this.playlistId === 'fav' && isRefresh && !isIncomplete && hasSourceManifest
      ? this.playlistLoaderService.startNewFavouriteTracksCheck(userId, true)
      : this.playlistLoaderService.startLoadingTask(userId, this.playlistId, isRefresh, isExpired);
    if (!task) return;
    this.subscribeToLoaderTask(task);
  }

  async refreshPlaylist() {
    this.playlistLoaderService.clearLoadingTask(this.playlistId);
    if (this.playlistId === 'fav') {
      const userId = this.authService.getUserId() || 'anonymous';
      const incrementalTask = this.playlistLoaderService.startNewFavouriteTracksCheck(userId, true);
      if (incrementalTask) this.subscribeToLoaderTask(incrementalTask, true);
      return;
    }
    // Standard playlists keep their daily full-refresh boundary. Liked Songs
    // exposes the cheaper incremental check explicitly through this action.
    await this.loadArtistsFromPlaylist();
  }

  private subscribeToLoaderTask(task: any, silent: boolean = false) {
    this.loaderSubscription = task.progress$.subscribe((progress: any) => {
      if (!silent) {
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
      }

      if (progress.isComplete) {
        const userId = this.authService.getUserId() || 'anonymous';
        const storedArtists = this.storageService.getItem(`${userId}_${this.playlistId}`);
        if (storedArtists) {
          this.artists = JSON.parse(storedArtists);
          this.filterArtists();
          this.healVisibleArtistImages();
        }
        this.playlistLoaderService.clearLoadingTask(this.playlistId);
        if (this.loaderSubscription) {
          this.loaderSubscription.unsubscribe();
          this.loaderSubscription = null;
        }
      } else if (!silent) {
        this.artists = (this.artists.length === 0 || !progress.isRefreshing) ? progress.artists : this.artists;
        this.filterArtists();
      }
    });
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.windowScrollHandler);
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

  @HostListener('document:click')
  onDocumentClick() {
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

  sortAlbumsByTracks() {
    this.albumSortOrder = this.albumSortOrder === 'desc' ? 'asc' : 'desc';
    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.setItem(`${userId}_albums_sortOrder`, this.albumSortOrder);
    this.filterAlbums();
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
    this.updatePlaylistAlbums();
  }

  updatePlaylistAlbums() {
    const albums = new Map<string, any>();

    this.playlistTracks.forEach(track => {
      const album = track.album;
      if (!album?.id) return;

      const existing = albums.get(album.id);
      if (existing) {
        existing.trackCount++;
        existing.durationMs += track.duration_ms || 0;
        existing.tracks.push(track);
        return;
      }

      const artists = Array.isArray(album.artists) && album.artists.length
        ? album.artists
        : (track.artists || []);

      albums.set(album.id, {
        id: album.id,
        name: album.name || 'Unknown Album',
        imageUrl: album.images?.[0]?.url || null,
        spotifyUrl: album.external_urls?.spotify ||
          `https://open.spotify.com/album/${encodeURIComponent(album.id)}`,
        releaseDate: album.release_date || '',
        artists: artists.map((artist: any) => artist.name).filter(Boolean),
        trackCount: 1,
        durationMs: track.duration_ms || 0,
        tracks: [track]
      });
    });

    this.playlistAlbums = Array.from(albums.values())
      .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
    this.filterAlbums();
  }

  filterAlbums() {
    this.displayedAlbumsCount = 50;
    const query = this.albumSearchText.trim().toLowerCase();
    const filtered = query
      ? this.playlistAlbums.filter(album =>
          album.name.toLowerCase().includes(query) ||
          album.artists.some((artist: string) => artist.toLowerCase().includes(query))
        )
      : [...this.playlistAlbums];

    this.filteredAlbums = filtered.sort((a, b) => {
      const countComparison = a.trackCount - b.trackCount;
      if (countComparison !== 0) {
        return this.albumSortOrder === 'asc' ? countComparison : -countComparison;
      }
      return a.name.localeCompare(b.name);
    });
  }

  onArtistImageError(artist: any, event: Event) {
    const image = event.target as HTMLImageElement | null;
    const placeholderUrl = 'https://misc.scdn.co/liked-songs/liked-songs-300.png';
    if (!image || image.src === placeholderUrl) return;

    const failedImageUrl = artist.images?.[0]?.url || image.currentSrc || image.src;
    this.imageHealingService.markArtistImageFailed(artist.id, failedImageUrl);
    artist.images = [];
    image.src = placeholderUrl;
    this.healVisibleArtistImages([artist]);
  }

  private healVisibleArtistImages(artists = this.filteredArtists.slice(0, this.displayedArtistsCount)) {
    if (!Array.isArray(artists) || artists.length === 0) return;
    const userId = this.authService.getUserId() || 'anonymous';
    this.imageHealingService.healArtistImages(
      artists,
      `${userId}_${this.playlistId}`
    );
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

  openAlbumDetails(album: any) {
    this.albumListScrollPosition = window.scrollY;
    this.selectedAlbum = {
      ...album,
      tracks: [...(album.tracks || [])].sort((a: any, b: any) =>
        (a.playlist_index || 0) - (b.playlist_index || 0)
      )
    };
    // The grid item can be far down the page. Reset immediately so the sticky
    // app header cannot cover a partially completed smooth scroll transition.
    window.scrollTo({top: 0, behavior: 'auto'});
  }

  closeAlbumDetails() {
    this.selectedAlbum = null;
    const previousPosition = this.albumListScrollPosition;
    requestAnimationFrame(() => {
      window.scrollTo({top: previousPosition, behavior: 'auto'});
    });
  }

  onAlbumCardKeydown(event: KeyboardEvent, album: any) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openAlbumDetails(album);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    this.closeAlbumDetails();
  }

  openTrackClick(url: string) {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  trackArtistItem(index: number, artist: any): string | number {
    return artist?.id || artist?.uri || artist?.name || index;
  }

  trackSongItem(index: number, track: any): string | number {
    return track?.id || track?.uri || `${track?.name || 'track'}:${index}`;
  }

  trackAlbumItem(index: number, album: any): string | number {
    return album?.id || album?.uri || `${album?.name || 'album'}:${index}`;
  }

  onWindowScroll() {
    const threshold = 300; // 300px before bottom
    const position = (window.innerHeight + window.scrollY);
    const height = document.documentElement.scrollHeight;

    if (position < height - threshold) return;

    const hasMoreItems = this.viewStyle === 'artists'
      ? this.displayedArtistsCount < this.filteredArtists.length
      : this.viewStyle === 'songs'
        ? this.displayedTracksCount < this.filteredTracks.length
        : this.displayedAlbumsCount < this.filteredAlbums.length;
    if (!hasMoreItems) return;

    this.ngZone.run(() => {
      if (this.viewStyle === 'artists') {
        if (this.displayedArtistsCount < this.filteredArtists.length) {
          this.displayedArtistsCount += 50;
          this.healVisibleArtistImages();
        }
      } else if (this.viewStyle === 'songs') {
        if (this.displayedTracksCount < this.filteredTracks.length) {
          this.displayedTracksCount += 50;
        }
      } else if (this.displayedAlbumsCount < this.filteredAlbums.length) {
        this.displayedAlbumsCount += 50;
      }
    });
  }
}
