import { Component, OnInit, OnDestroy, ViewEncapsulation, Optional } from '@angular/core';
import { ActivatedRoute, Router } from "@angular/router";
import { SpotifyAuthService } from "@core/auth/spotify-auth.service";
import { StorageService } from "@core/data-access/storage/storage.service";
import {distinctUntilChanged, map, Subscription} from 'rxjs';
import { PlaylistLoaderService } from "@core/sync/playlist-loader/playlist-loader.service";
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {SpotifyNavigationService} from '@core/navigation/spotify-navigation.service';

const console = createScopedLogger('Playlist Analysis');

@Component({
  selector: 'app-playlist-analysis',
  templateUrl: './playlist-analysis.component.html',
  styleUrls: ['./playlist-analysis.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class PlaylistAnalysisComponent implements OnInit, OnDestroy {
  playlistId: string = '';
  playlistName: string = '';
  artists: any[] = [];
  isLoading: boolean = true;
  isRefreshing: boolean = false;
  refreshingArtists: any[] = [];
  loadedTracksCount: number = 0;
  totalTracks: number = 0;
  cooldownMessage: string = '';

  // Real-time progress properties
  isLoadingTracks: boolean = false;
  isLoadingArtists: boolean = false;
  loadedArtistsDetailsCount: number = 0;
  totalUniqueArtists: number = 0;
  private requestedArtistIds = new Set<string>();

  // Analysis results
  uniqueTracksCount: number = 0;
  uniqueArtistsCount: number = 0;
  uniqueAlbumsCount: number = 0;
  totalDurationFormatted: string = '';
  averageDurationFormatted: string = '';
  explicitCount: number = 0;
  explicitPercentage: number = 0;
  topArtists: Array<{id: string; name: string; count: number}> = [];
  topAlbums: Array<{name: string; count: number}> = [];

  longestTrack: any = null;
  shortestTrack: any = null;
  oldestTrack: any = null;
  newestTrack: any = null;


  private loaderSubscription: Subscription | null = null;
  private routeSubscription: Subscription | null = null;
  private loadGeneration = 0;

  private readonly nav: SpotifyNavigationService;

  constructor(
    private route: ActivatedRoute,
    public authService: SpotifyAuthService,
    private router: Router,
    private storageService: StorageService,
    private playlistLoaderService: PlaylistLoaderService,
    @Optional() private spotifyNavigation?: SpotifyNavigationService
  ) {
    this.nav = this.spotifyNavigation || new SpotifyNavigationService();
  }

  ngOnInit() {
    this.routeSubscription = this.route.params.pipe(
      map(params => params['id']),
      distinctUntilChanged()
    ).subscribe(playlistId => {
      const loadGeneration = ++this.loadGeneration;
      this.unsubscribeFromLoaderTask();
      this.playlistId = playlistId;
      this.resetPlaylistView();
      if (this.authService.isAuthenticated()) {
        void this.authService.ensureInitialSync().catch(() => {});
      }
      void this.loadPlaylistData(playlistId, loadGeneration);
    });
  }

  ngOnDestroy() {
    this.loadGeneration++;
    this.routeSubscription?.unsubscribe();
    this.routeSubscription = null;
    this.unsubscribeFromLoaderTask();
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

  async loadPlaylistData(
    playlistId: string = this.playlistId,
    loadGeneration: number = this.loadGeneration
  ) {
    if (!this.isCurrentLoad(playlistId, loadGeneration)) return;
    this.isLoading = this.artists.length === 0;
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${playlistId}`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;

    // Check if there is an active background task running for this playlist
    const activeTask = this.playlistLoaderService.getLoadingTask(playlistId);
    if (activeTask) {
      const storedArtists = this.storageService.getItem(storageKey);
      if (storedArtists) {
        try {
          this.artists = JSON.parse(storedArtists);
          this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${playlistId}_Amount`) || '0');
          this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${playlistId}_Name`) || '""');
          this.runAnalysis();
          this.isLoading = false;
        } catch (e) {
          console.warn('Failed to parse stored artists for active task:', e);
        }
      }
      this.subscribeToLoaderTask(
        activeTask,
        activeTask.mode === 'incremental-new-only',
        playlistId,
        loadGeneration
      );
      return;
    }

    const isBackupActive = this.authService.isBackupActive();
    let storedArtists = this.storageService.getItem(storageKey);
    let lastUpdated = this.storageService.getItem(lastUpdatedKey);
    let isExpired = this.isCacheExpired(lastUpdated);
    let parsedArtists: any[] = [];
    let isParseError = false;
    let cachedTotalTracks = 0;
    let cachedTrackCount: number | null = null;
    let isComplete = false;
    let sourceManifest = this.playlistLoaderService.readSourceManifest(userId, playlistId);
    let sourceDirty = this.playlistLoaderService.isPlaylistSourceDirty(userId, playlistId);

    const parseCachedArtists = () => {
      parsedArtists = [];
      isParseError = false;
      cachedTotalTracks = 0;
      cachedTrackCount = null;
      sourceManifest = this.playlistLoaderService.readSourceManifest(userId, playlistId);
      sourceDirty = this.playlistLoaderService.isPlaylistSourceDirty(userId, playlistId);
      const parsedAmount = JSON.parse(
        this.storageService.getItem(`${storageKey}_Amount`) || '0'
      );
      cachedTotalTracks =
        Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;
      cachedTotalTracks = this.playlistLoaderService.resolveExpectedPlaylistTotal(
        userId,
        playlistId,
        cachedTotalTracks
      );
      if (storedArtists) {
        try {
          const parsed = JSON.parse(storedArtists);
          if (!Array.isArray(parsed)) {
            isParseError = true;
          } else {
            parsedArtists = parsed;
          }

          const cachedTrackCountString =
            this.storageService.getItem(`${storageKey}_CachedTrackCount`);
          if (cachedTrackCountString !== null) {
            const parsedCachedTrackCount = JSON.parse(cachedTrackCountString);
            if (Number.isFinite(parsedCachedTrackCount) && parsedCachedTrackCount >= 0) {
              cachedTrackCount = parsedCachedTrackCount;
            }
          }
        } catch (e) {
          console.warn('Failed to parse stored artists for analysis:', e);
          isParseError = true;
        }
      }

      isComplete = !isParseError && this.playlistLoaderService.isCachedPlaylistComplete(
        parsedArtists,
        cachedTotalTracks,
        cachedTrackCount,
        sourceManifest
      );
    };

    parseCachedArtists();

    if (
      (!storedArtists || isExpired || isParseError || !isComplete) &&
      isBackupActive
    ) {
      this.storageService.removeItem(`${storageKey}_CachedTrackCount`);
      this.storageService.removeItem(
        this.playlistLoaderService.sourceManifestKey(userId, playlistId)
      );
      await this.storageService.restoreItemsFromCloud([
        storageKey,
        `${storageKey}_Amount`,
        `${storageKey}_Name`,
        `${storageKey}_CachedTrackCount`,
        this.playlistLoaderService.sourceManifestKey(userId, playlistId),
        lastUpdatedKey
      ], () => this.isCurrentLoad(playlistId, loadGeneration));
      if (!this.isCurrentLoad(playlistId, loadGeneration)) return;
      storedArtists = this.storageService.getItem(storageKey);
      lastUpdated = this.storageService.getItem(lastUpdatedKey);
      isExpired = this.isCacheExpired(lastUpdated);
      parseCachedArtists();
    }

    if (storedArtists && !isExpired && !isParseError && isComplete && !sourceDirty) {
      console.log(`[Analysis] Loading playlist ${playlistId} data from the local IndexedDB cache.`);
      try {
        this.artists = parsedArtists;
        this.totalTracks = cachedTotalTracks;
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${playlistId}_Name`) || '""');
        this.runAnalysis();
        this.isLoading = false;
      } catch (e) {
        console.warn('Failed to load playlist analysis data from cache:', e);
        this.triggerApiLoad(false, isExpired, false, playlistId, loadGeneration);
      }
    } else {
      this.totalTracks = cachedTotalTracks;
      this.playlistName = JSON.parse(
        this.storageService.getItem(`${storageKey}_Name`) || '""'
      );
      if (storedArtists && !isParseError) {
        try {
          this.artists = parsedArtists;
          this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${playlistId}_Amount`) || '0');
          this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${playlistId}_Name`) || '""');
          this.runAnalysis();
        } catch (e) {
          console.warn('Failed to load temporary stale analysis data:', e);
        }
      }
      // If we have cached data but it's expired, we do background refresh to maintain smooth UX
      this.triggerApiLoad(
        !!storedArtists && !isParseError,
        isExpired || !isComplete || sourceDirty,
        playlistId === 'fav' && !!sourceManifest && isComplete,
        playlistId,
        loadGeneration
      );
    }
  }

  triggerApiLoad(
    isBackgroundRefresh: boolean,
    isDailyFullSync: boolean = false,
    preferIncrementalLikedSongs: boolean = false,
    playlistId: string = this.playlistId,
    loadGeneration: number = this.loadGeneration
  ) {
    if (!this.isCurrentLoad(playlistId, loadGeneration)) return;
    const userId = this.authService.getUserId() || 'anonymous';

    this.unsubscribeFromLoaderTask();

    const task = preferIncrementalLikedSongs
      ? this.playlistLoaderService.startNewFavouriteTracksCheck(userId, true)
      : this.playlistLoaderService.startLoadingTask(
          userId,
          playlistId,
          isBackgroundRefresh,
          isDailyFullSync
        );
    if (!task) return;
    this.subscribeToLoaderTask(task, false, playlistId, loadGeneration);
  }

  private subscribeToLoaderTask(
    task: any,
    silent: boolean = false,
    playlistId: string = this.playlistId,
    loadGeneration: number = this.loadGeneration
  ) {
    const userId = this.authService.getUserId() || 'anonymous';
    this.loaderSubscription = task.progress$.subscribe((progress: any) => {
      if (!this.isCurrentLoad(playlistId, loadGeneration)) return;
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
        this.isLoading = false;
        this.isLoadingTracks = false;
        this.isLoadingArtists = false;
        this.isRefreshing = false;
        const storedArtists = this.storageService.getItem(`${userId}_${playlistId}`);
        if (storedArtists) {
          try {
            this.artists = JSON.parse(storedArtists);
            this.runAnalysis();
          } catch (e) {
            console.warn('Failed to parse artists on completion:', e);
          }
        }
        this.playlistLoaderService.clearLoadingTask(playlistId);
        this.unsubscribeFromLoaderTask();
      } else if (!silent) {
        this.artists = (this.artists.length === 0 || !progress.isRefreshing) ? progress.artists : this.artists;
      }
    });
  }

  private isCurrentLoad(playlistId: string, loadGeneration: number): boolean {
    return this.playlistId === playlistId && this.loadGeneration === loadGeneration;
  }

  private unsubscribeFromLoaderTask(): void {
    this.loaderSubscription?.unsubscribe();
    this.loaderSubscription = null;
  }

  private resetPlaylistView(): void {
    this.playlistName = '';
    this.artists = [];
    this.isLoading = true;
    this.isRefreshing = false;
    this.refreshingArtists = [];
    this.loadedTracksCount = 0;
    this.totalTracks = 0;
    this.cooldownMessage = '';
    this.isLoadingTracks = false;
    this.isLoadingArtists = false;
    this.loadedArtistsDetailsCount = 0;
    this.totalUniqueArtists = 0;
    this.requestedArtistIds.clear();
    this.runAnalysis();
  }

  runAnalysis() {
    const tracksMap = new Map<string, any>();
    this.artists.forEach(artist => {
      artist.tracks.forEach((track: any) => {
        if (track && track.id) {
          if (!track.artist_name) {
            track.artist_name = artist.name;
          }
          tracksMap.set(track.id, track);
        }
      });
    });

    const uniqueTracks = Array.from(tracksMap.values());
    this.uniqueTracksCount = uniqueTracks.length;

    const uniqueArtistKeys = new Set<string>();
    const uniqueAlbumKeys = new Set<string>();
    const artistCounts = new Map<string, {id: string; name: string; count: number}>();
    const albumCounts = new Map<string, number>();
    uniqueTracks.forEach(track => {
      const trackArtists = Array.isArray(track.artists) ? track.artists : [];
      const countedTrackArtists = new Set<string>();
      trackArtists.forEach((artist: any) => {
        const key = artist?.id || artist?.name?.trim().toLowerCase();
        if (!key) return;
        uniqueArtistKeys.add(key);
        if (!countedTrackArtists.has(key)) {
          const current = artistCounts.get(key) || {
            id: artist?.id || key,
            name: artist?.name || track.artist_name || 'Unknown artist',
            count: 0
          };
          current.count++;
          artistCounts.set(key, current);
          countedTrackArtists.add(key);
        }
      });

      if (trackArtists.length === 0 && track.artist_name) {
        const key = track.artist_name.trim().toLowerCase();
        uniqueArtistKeys.add(key);
        const current = artistCounts.get(key) || {id: key, name: track.artist_name, count: 0};
        current.count++;
        artistCounts.set(key, current);
      }

      const albumKey = track.album?.id || track.album?.name?.trim().toLowerCase();
      if (albumKey) uniqueAlbumKeys.add(albumKey);
      const albumName = track.album?.name?.trim();
      if (albumName) albumCounts.set(albumName, (albumCounts.get(albumName) || 0) + 1);
    });
    this.uniqueArtistsCount = uniqueArtistKeys.size;
    this.uniqueAlbumsCount = uniqueAlbumKeys.size;
    this.topArtists = Array.from(artistCounts.values())
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
    this.topAlbums = Array.from(albumCounts.entries())
      .map(([name, count]) => ({name, count}))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);

    if (uniqueTracks.length === 0) {
      this.totalDurationFormatted = '0 sec';
      this.averageDurationFormatted = '0:00';
      this.explicitCount = 0;
      this.explicitPercentage = 0;
      this.topArtists = [];
      this.topAlbums = [];
      this.longestTrack = null;
      this.shortestTrack = null;
      this.oldestTrack = null;
      this.newestTrack = null;
      return;
    }

    let totalDurationMs = 0;
    let explicitCount = 0;

    uniqueTracks.forEach(track => {
      totalDurationMs += track.duration_ms || 0;
      if (track.explicit) {
        explicitCount++;
      }
    });

    this.totalDurationFormatted = this.formatDuration(totalDurationMs);
    this.averageDurationFormatted = this.formatDurationShort(totalDurationMs / uniqueTracks.length);
    this.explicitCount = explicitCount;
    this.explicitPercentage = Math.round((explicitCount / uniqueTracks.length) * 1000) / 10;

    // Filter tracks with valid duration (e.g. at least 5 seconds, and has a value)
    const validDurationTracks = uniqueTracks.filter(t => t.duration_ms && t.duration_ms > 5000);
    if (validDurationTracks.length > 0) {
      const sortedByDuration = [...validDurationTracks].sort((a, b) => a.duration_ms - b.duration_ms);
      this.shortestTrack = sortedByDuration[0];
      this.longestTrack = sortedByDuration[sortedByDuration.length - 1];
    } else {
      this.shortestTrack = null;
      this.longestTrack = null;
    }

    // Filter tracks with valid release dates (at least 4 characters, doesn't start with 0000 or 1970-01-01)
    const tracksWithDates = uniqueTracks.filter(t =>
      t.album &&
      t.album.release_date &&
      t.album.release_date.length >= 4 &&
      !t.album.release_date.startsWith('0000') &&
      !t.album.release_date.startsWith('1970-01-01')
    );
    if (tracksWithDates.length > 0) {
      const sortedByDate = [...tracksWithDates].sort((a, b) => {
        return a.album.release_date.localeCompare(b.album.release_date);
      });
      this.oldestTrack = sortedByDate[0];
      this.newestTrack = sortedByDate[sortedByDate.length - 1];
    } else {
      this.oldestTrack = null;
      this.newestTrack = null;
    }

  }

  get isAnalysisPending(): boolean {
    return (this.isLoading || this.isLoadingTracks || this.isLoadingArtists)
      && this.uniqueTracksCount === 0;
  }

  formatDuration(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs} hr ${mins} min`;
    } else {
      return `${mins} min ${secs} sec`;
    }
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

  goBack() {
    this.router.navigate(['/playlists']);
  }

  openTrackClick(url: string) {
    this.nav.openTrack(url);
  }

  }
