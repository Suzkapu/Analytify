import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from "@angular/router";
import { SpotifyDataService } from "../../services/spotify-data/spotify-data.service";
import { SpotifyAuthService } from "../../services/auth/spotify-auth.service";
import { StorageService } from "../../services/storage/storage.service";
import { Subscription } from 'rxjs';
import { PlaylistLoaderService } from "../../services/playlist-loader/playlist-loader.service";

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
  isLoading: boolean = false;
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
  totalDurationFormatted: string = '';
  averageDurationFormatted: string = '';
  averagePopularity: number = 0;
  explicitCount: number = 0;
  explicitPercentage: number = 0;

  topGenres: { name: string; count: number; percentage: number, percentage_simple: number, visualWidth?: number }[] = [];
  longestTrack: any = null;
  shortestTrack: any = null;
  oldestTrack: any = null;
  newestTrack: any = null;


  private loaderSubscription: Subscription | null = null;

  constructor(
    private route: ActivatedRoute,
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private router: Router,
    private storageService: StorageService,
    private playlistLoaderService: PlaylistLoaderService
  ) { }

  ngOnInit() {
    this.route.params.subscribe(async params => {
      this.playlistId = params['id'];
      if (this.authService.isAuthenticated()) {
        await this.authService.ensureInitialSync();
      }
      await this.loadPlaylistData();
    });
  }

  ngOnDestroy() {
    if (this.loaderSubscription) {
      this.loaderSubscription.unsubscribe();
      this.loaderSubscription = null;
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

  async loadPlaylistData() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${this.playlistId}`;
    const lastUpdatedKey = `${storageKey}_lastUpdated`;

    // Check if there is an active background task running for this playlist
    const activeTask = this.playlistLoaderService.getLoadingTask(this.playlistId);
    if (activeTask) {
      const storedArtists = this.storageService.getItem(storageKey);
      if (storedArtists) {
        try {
          this.artists = JSON.parse(storedArtists);
          this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
          this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
          this.runAnalysis();
        } catch (e) {
          console.warn('Failed to parse stored artists for active task:', e);
        }
      }
      this.subscribeToLoaderTask(activeTask);
      return;
    }

    const isBackupActive = this.authService.isBackupActive();
    let storedArtists = this.storageService.getItem(storageKey);
    let lastUpdated = this.storageService.getItem(lastUpdatedKey);
    let isExpired = this.isCacheExpired(lastUpdated);
    let parsedArtists: any[] = [];
    let isParseError = false;

    const parseCachedArtists = () => {
      parsedArtists = [];
      isParseError = false;
      if (storedArtists) {
        try {
          const parsed = JSON.parse(storedArtists);
          if (!Array.isArray(parsed)) {
            isParseError = true;
          } else {
            parsedArtists = parsed;
          }
        } catch (e) {
          console.warn('Failed to parse stored artists for analysis:', e);
          isParseError = true;
        }
      }
    };

    parseCachedArtists();
    let isOldCache = parsedArtists.length > 0 &&
      parsedArtists.some(artist => !Array.isArray(artist.images) || !Array.isArray(artist.genres));

    if ((!storedArtists || isExpired || isParseError || isOldCache) && isBackupActive) {
      await this.storageService.restoreItemsFromCloud([
        storageKey,
        `${storageKey}_Amount`,
        `${storageKey}_Name`,
        lastUpdatedKey,
        `${storageKey}_cacheVersion`
      ]);
      storedArtists = this.storageService.getItem(storageKey);
      lastUpdated = this.storageService.getItem(lastUpdatedKey);
      isExpired = this.isCacheExpired(lastUpdated);
      parseCachedArtists();
      isOldCache = parsedArtists.length > 0 &&
        parsedArtists.some(artist => !Array.isArray(artist.images) || !Array.isArray(artist.genres));
    }

    if (storedArtists && !isExpired && !isParseError && !isOldCache) {
      console.log(isBackupActive ? `[Analysis] Loading playlist ${this.playlistId} data from Supabase Cloud Backup (Local Cache)` : `[Analysis] Loading playlist ${this.playlistId} data from Local Storage Cache (Cloud Backup disabled)`);
      try {
        this.artists = parsedArtists;
        this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.runAnalysis();
      } catch (e) {
        console.warn('Failed to load playlist analysis data from cache:', e);
        this.triggerApiLoad(false, isExpired);
      }
    } else {
      if (storedArtists && !isParseError) {
        try {
          this.artists = parsedArtists;
          this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
          this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
          this.runAnalysis();
        } catch (e) {
          console.warn('Failed to load temporary stale analysis data:', e);
        }
      }
      // If we have cached data but it's expired, we do background refresh to maintain smooth UX
      this.triggerApiLoad(!!storedArtists && !isParseError, isExpired);
    }
  }

  triggerApiLoad(isBackgroundRefresh: boolean, allowFullFallback: boolean = false) {
    const userId = this.authService.getUserId() || 'anonymous';
    
    // Cancel previous loader task subscription if any
    if (this.loaderSubscription) {
      this.loaderSubscription.unsubscribe();
      this.loaderSubscription = null;
    }

    const task = this.playlistLoaderService.startLoadingTask(userId, this.playlistId, isBackgroundRefresh, allowFullFallback);
    this.subscribeToLoaderTask(task);
  }

  private subscribeToLoaderTask(task: any) {
    const userId = this.authService.getUserId() || 'anonymous';
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
        const storedArtists = this.storageService.getItem(`${userId}_${this.playlistId}`);
        if (storedArtists) {
          try {
            this.artists = JSON.parse(storedArtists);
            this.runAnalysis();
          } catch (e) {
            console.warn('Failed to parse artists on completion:', e);
          }
        }
        this.playlistLoaderService.clearLoadingTask(this.playlistId);
        if (this.loaderSubscription) {
          this.loaderSubscription.unsubscribe();
          this.loaderSubscription = null;
        }
      } else {
        this.artists = (this.artists.length === 0 || !progress.isRefreshing) ? progress.artists : this.artists;
        if (this.artists && this.artists.length > 0) {
          this.runAnalysis();
        }
      }
    });
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

    if (uniqueTracks.length === 0) {
      this.totalDurationFormatted = '0 sec';
      this.averageDurationFormatted = '0:00';
      this.averagePopularity = 0;
      this.explicitCount = 0;
      this.explicitPercentage = 0;
      this.topGenres = [];
      this.longestTrack = null;
      this.shortestTrack = null;
      this.oldestTrack = null;
      this.newestTrack = null;
      return;
    }

    let totalDurationMs = 0;
    let totalPopularity = 0;
    let explicitCount = 0;

    uniqueTracks.forEach(track => {
      totalDurationMs += track.duration_ms || 0;
      totalPopularity += track.popularity || 0;
      if (track.explicit) {
        explicitCount++;
      }
    });

    this.totalDurationFormatted = this.formatDuration(totalDurationMs);
    this.averageDurationFormatted = this.formatDurationShort(totalDurationMs / uniqueTracks.length);
    this.averagePopularity = Math.round(totalPopularity / uniqueTracks.length);
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

    const genreCounts = new Map<string, number>();
    this.artists.forEach(artist => {
      const artistSongCount = artist.tracks.length;
      if (artist.genres && artist.genres.length) {
        // Divide count equally among the genres of this artist
        const weightPerGenre = artistSongCount / artist.genres.length;
        artist.genres.forEach((genre: string) => {
          const count = genreCounts.get(genre) || 0;
          genreCounts.set(genre, count + weightPerGenre);
        });
      }
    });

    const totalGenresWeight = Array.from(genreCounts.values()).reduce((sum, val) => sum + val, 0);

    const sorted = Array.from(genreCounts.entries())
      .map(([name, count]) => {
        const percentage = totalGenresWeight > 0 ? Math.min(100, Math.round((count / totalGenresWeight) * 100)) : 0;
        const percentage_simple = uniqueTracks.length > 0 ? Math.min(100, Math.round((count / uniqueTracks.length) * 100)) : 0;

        return { name, count: Math.round(count), percentage, percentage_simple };
      })
      .sort((a, b) => b.count - a.count);

    const maxCount = sorted.length > 0 ? sorted[0].count : 1;

    this.topGenres = sorted.map(g => ({
      ...g,
      visualWidth: g.count > 0 ? Math.max(2, Math.min(100, Math.round((g.count / maxCount) * 100))) : 0
    })).slice(0, 10);

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
    if (url) {
      window.location.href = url;
    }
  }

  }
