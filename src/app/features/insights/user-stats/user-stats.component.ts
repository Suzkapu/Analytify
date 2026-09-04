import { Component, OnInit, OnDestroy, HostListener, Optional } from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { firstValueFrom, forkJoin, Subscription } from 'rxjs';
import {PastTopItem, SupabaseService} from '@core/data-access/supabase/supabase.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {mapWithConcurrency, runAfterNextPaint} from '@core/performance/async-load';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';

const console = createScopedLogger('Personal Stats');

function toDailySnapshotDateKey(ts: number): string {
  const d = new Date(ts);
  if (d.getHours() < 1) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${r}`;
}

type StatsCategory = 'tracks' | 'artists' | 'genres';
type StatsTrend = { type: 'up' | 'down' | 'same' | 'new'; diff?: number };
type SnapshotCalendarTarget = 'history' | 'compare';
type SnapshotCalendarDay = {
  dateKey: string;
  dayNumber: number;
  optionId: string | null;
  isAvailable: boolean;
  isSelected: boolean;
  isToday: boolean;
  ariaLabel: string;
};

function compareCalendarWeekdays(): string[] {
  const monday = new Date(2024, 0, 1, 12);
  return Array.from({length: 7}, (_, offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    return date.toLocaleDateString(undefined, {weekday: 'narrow'});
  });
}

@Component({
  selector: 'app-user-stats',
  templateUrl: './user-stats.component.html',
  styleUrls: ['./user-stats.component.scss']
})
export class UserStatsComponent implements OnInit, OnDestroy {
  selectedRange: string = 'short_term'; // 'short_term', 'medium_term', 'long_term'
  selectedCategory: string = 'tracks'; // 'tracks', 'artists', 'genres'
  statsSearchQuery: string = '';
  pastTopResults: PastTopItem[] = [];
  isSearchingPastStats = false;
  pastStatsSearchError = '';
  isLoading: boolean = true;
  isRefreshingStats: boolean = false;
  spyDisplayName = '';
  spyImageUrl = '';
  spySnapshotDate = '';
  sharedStatsError = '';


  topTracks: any[] = [];
  topArtists: any[] = [];
  topGenres: { name: string; count: number; percentage: number; percentage_simple?: number }[] = [];
  
  // Stats History variables
  historyData: any[] = [];
  selectedHistoryPoint: any = null;
  selectedSnapshotId: string = 'current';
  compareSnapshotId: string = '';
  snapshotOptions: any[] = [];
  showHistoryMenu: boolean = false;
  showCompareMenu: boolean = false;
  historyCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  historyCalendarMonthLabel = '';
  historyCalendarDays: Array<SnapshotCalendarDay | null> = [];
  compareCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  compareCalendarMonthLabel = '';
  compareCalendarDays: Array<SnapshotCalendarDay | null> = [];
  readonly compareCalendarWeekdays = compareCalendarWeekdays();
  hotMoverTracks = new Set<string>();
  hotMoverArtists = new Set<string>();
  highDebutTracks = new Set<string>();
  highDebutArtists = new Set<string>();
  readonly highDebutRankLimit = 10;
  readonly hotMoverDisplayLimit = 10;
  readonly newEntryBaselineRank = 101;
  private historyWriteQueue: Promise<void> = Promise.resolve();
  private statsLoadSequence = 0;
  private historyLoadSequence = 0;
  private statsSubscription: Subscription | null = null;
  private cancelScheduledHistoryLoad: (() => void) | null = null;
  private pastSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private pastSearchSequence = 0;

  // Trend modal variables
  showTrendPopup: boolean = false;
  trendPopupItem: any = null;
  trendPopupCategory: 'tracks' | 'artists' | 'genres' = 'tracks';
  trendPopupPoints: any[] = [];
  isLoadingTrendData: boolean = false;
  visibleLabelIndices = new Set<number>();
  hoveredPointIndex: number | null = null;

  // Listening History & Modal Variables

  isCreatingPlaylist: boolean = false;
  playlistCreationSuccessMessage: string = '';

  constructor(
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService,
    @Optional() private route?: ActivatedRoute,
    @Optional() private statsSharing?: StatsSharingService
  ) { }

  get spyOwnerUserId(): string {
    return this.route?.snapshot?.paramMap?.get('userId') || '';
  }

  get isSpyMode(): boolean {
    return !!this.spyOwnerUserId;
  }

  ngOnInit() {
    // Start the visible selected-range request in the critical turn. Historical
    // metadata begins only after the browser gets a paint opportunity, while
    // broad account hydration remains fully independent in the background.
    void this.loadStats();
    if (this.isSpyMode) return;
    this.scheduleHistoryLoad();
    if (this.authService.isAuthenticated()) {
      void this.authService.ensureInitialSync().then(() => {
        if (this.snapshotOptions.length === 0 && this.authService.isBackupActive()) {
          this.scheduleHistoryLoad();
        }
      }).catch(() => {});
    }
  }

  ngOnDestroy() {
    this.statsLoadSequence++;
    this.historyLoadSequence++;
    this.statsSubscription?.unsubscribe();
    this.statsSubscription = null;
    this.cancelScheduledHistoryLoad?.();
    this.cancelScheduledHistoryLoad = null;
    this.pastSearchSequence++;
    if (this.pastSearchTimer) clearTimeout(this.pastSearchTimer);
    this.pastSearchTimer = null;
  }

  changeRange(range: string) {
    if (range === this.selectedRange) return;

    this.statsLoadSequence++;
    this.historyLoadSequence++;
    this.statsSubscription?.unsubscribe();
    this.statsSubscription = null;
    this.selectedSnapshotId = 'current';
    this.selectedRange = range;
    this.compareSnapshotId = '';
    this.historyData = [];
    this.snapshotOptions = [];
    this.topTracks = [];
    this.topArtists = [];
    this.topGenres = [];
    this.resetPastStatsSearch();
    void this.loadStats();
    if (!this.isSpyMode) this.scheduleHistoryLoad();
    this.schedulePastStatsSearch();
  }

  private scheduleHistoryLoad(): void {
    this.cancelScheduledHistoryLoad?.();
    this.cancelScheduledHistoryLoad = runAfterNextPaint(() => {
      this.cancelScheduledHistoryLoad = null;
      this.loadHistoryData();
    });
  }

  changeCategory(category: string) {
    this.selectedCategory = category;
    this.schedulePastStatsSearch();
  }

  onStatsSearchChange(query: string): void {
    this.statsSearchQuery = query;
    this.schedulePastStatsSearch();
  }

  private schedulePastStatsSearch(): void {
    if (this.pastSearchTimer) clearTimeout(this.pastSearchTimer);
    this.pastSearchTimer = null;
    const query = this.statsSearchQuery.trim();
    if (query.length < 2 || this.isSpyMode || this.selectedSnapshotId !== 'current'
      || !['tracks', 'artists'].includes(this.selectedCategory)) {
      this.resetPastStatsSearch();
      return;
    }
    const sequence = ++this.pastSearchSequence;
    this.isSearchingPastStats = true;
    this.pastStatsSearchError = '';
    this.pastSearchTimer = setTimeout(() => {
      this.pastSearchTimer = null;
      void this.searchPastStats(query, sequence);
    }, 300);
  }

  async searchPastStats(query = this.statsSearchQuery.trim(), sequence = ++this.pastSearchSequence): Promise<void> {
    const supabaseUserId = this.authService.getSupabaseUserId();
    if (!supabaseUserId || !this.authService.isBackupActive()) {
      if (sequence === this.pastSearchSequence) {
        this.pastTopResults = [];
        this.isSearchingPastStats = false;
        this.pastStatsSearchError = 'Enable Cloud Backup to search your saved ranking history.';
      }
      return;
    }
    const kind = this.selectedCategory === 'artists' ? 'artist' : 'track';
    const range = this.selectedRange;
    try {
      const results = await this.supabaseService.searchPastTopItems(range, kind, query);
      if (sequence !== this.pastSearchSequence || range !== this.selectedRange
        || kind !== (this.selectedCategory === 'artists' ? 'artist' : 'track')) return;
      const currentIds = new Set((kind === 'track' ? this.topTracks : this.topArtists)
        .map(item => item?.id).filter(Boolean));
      this.pastTopResults = results.filter(item => !currentIds.has(item.id));
      this.pastStatsSearchError = '';
    } catch (error) {
      if (sequence !== this.pastSearchSequence) return;
      this.pastTopResults = [];
      this.pastStatsSearchError = (error as any)?.message || 'Saved ranking history could not be searched.';
    } finally {
      if (sequence === this.pastSearchSequence) this.isSearchingPastStats = false;
    }
  }

  private resetPastStatsSearch(): void {
    this.pastSearchSequence++;
    if (this.pastSearchTimer) clearTimeout(this.pastSearchTimer);
    this.pastSearchTimer = null;
    this.pastTopResults = [];
    this.isSearchingPastStats = false;
    this.pastStatsSearchError = '';
  }

  isCacheExpired(lastUpdatedStr: string | null, range = this.selectedRange): boolean {
    if (!lastUpdatedStr) return true;
    const lastUpdated = parseInt(lastUpdatedStr, 10);
    if (isNaN(lastUpdated)) return true;

    if (range !== 'short_term') {
      return lastUpdated < Date.now() - 7 * 24 * 60 * 60 * 1000;
    }

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0); // 1:00 AM today
    if (now.getTime() < cutoff.getTime()) {
      // If we haven't reached 1 AM today yet, the most recent cutoff was 1 AM yesterday
      cutoff.setDate(cutoff.getDate() - 1);
    }
    return lastUpdated < cutoff.getTime();
  }

  async loadStats() {
    const loadSequence = ++this.statsLoadSequence;
    this.statsSubscription?.unsubscribe();
    this.statsSubscription = null;

    if (this.isSpyMode) {
      await this.loadSharedStats(loadSequence);
      return;
    }

    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const range = this.selectedRange;
    const isCurrentLoad = () =>
      loadSequence === this.statsLoadSequence && range === this.selectedRange;
    const lastUpdatedKey = `${userId}_stats_${range}_lastUpdated`;
    const tracksKey = `${userId}_stats_${range}_tracks`;
    const artistsKey = `${userId}_stats_${range}_artists`;
    const genresKey = `${userId}_stats_${range}_genres`;
    let lastUpdated = this.storageService.getItem(lastUpdatedKey);
    let isExpired = this.isCacheExpired(lastUpdated, range);
    let cachedTracks = this.storageService.getItem(tracksKey);
    let cachedArtists = this.storageService.getItem(artistsKey);
    let cachedGenres = this.storageService.getItem(genresKey);
    let isCacheIncomplete = false;
    let parsedTracks: any[] = [];
    let parsedArtists: any[] = [];
    let parsedGenres: any[] = [];

    const updateLoadingState = () => {
      const hasVisibleStats = this.topTracks.length > 0
        || this.topArtists.length > 0
        || this.topGenres.length > 0;
      this.isLoading = !hasVisibleStats;
      this.isRefreshingStats = hasVisibleStats;
    };
    updateLoadingState();

    const parseCachedStats = () => {
      isCacheIncomplete = false;
      parsedTracks = [];
      parsedArtists = [];
      parsedGenres = [];

      try {
        parsedTracks = cachedTracks ? JSON.parse(cachedTracks) : [];
        parsedArtists = cachedArtists ? JSON.parse(cachedArtists) : [];
        parsedGenres = cachedGenres ? JSON.parse(cachedGenres) : [];
        if (!Array.isArray(parsedTracks) || !Array.isArray(parsedArtists) || !Array.isArray(parsedGenres)) {
          isCacheIncomplete = true;
          return;
        }
      } catch (e) {
        isCacheIncomplete = true;
        return;
      }

      // Spotify marks artist genres as deprecated and some personal apps now
      // receive an empty/missing genre cache even while artist data is intact.
      // Rebuild locally whenever the cached artist objects still carry genres.
      if (parsedGenres.length === 0 && parsedArtists.length > 0) {
        parsedGenres = this.buildGenres(parsedArtists);
        if (parsedGenres.length > 0) {
          this.storageService.setItem(genresKey, JSON.stringify(parsedGenres));
          cachedGenres = JSON.stringify(parsedGenres);
        }
      }
      isCacheIncomplete = !cachedTracks || !cachedArtists;
    };

    parseCachedStats();

    const enrichParsedGenres = async () => {
      if (parsedGenres.length > 0 || !parsedArtists.some((artist: any) => !!artist?.id)) return;
      try {
        const enriched = await this.enrichArtistGenres(parsedArtists);
        if (!isCurrentLoad()) return;
        if (enriched.genres.length > 0) {
          parsedArtists = enriched.artists;
          parsedGenres = enriched.genres;
          cachedArtists = JSON.stringify(parsedArtists);
          cachedGenres = JSON.stringify(parsedGenres);
          this.storageService.setItem(artistsKey, cachedArtists);
          this.storageService.setItem(genresKey, cachedGenres);
        }
      } catch (error) {
        console.warn('[Stats] Could not enrich cached artist genres.', error);
      }
    };
    await enrichParsedGenres();
    if (!isCurrentLoad()) return;

    const hasUsableCachedStats = () =>
      !isCacheIncomplete &&
      (parsedTracks.length > 0 || parsedArtists.length > 0 || parsedGenres.length > 0);

    // Stale-while-revalidate: never blank a complete current view merely
    // because its refresh is due. The replacement is assembled off-screen and
    // committed atomically when every required response has completed.
    if (hasUsableCachedStats() && isExpired && isCurrentLoad()) {
      this.topTracks = parsedTracks;
      this.topArtists = parsedArtists;
      this.topGenres = parsedGenres;
      this.isLoading = false;
      this.isRefreshingStats = true;
    }

    if ((isExpired || isCacheIncomplete) && this.authService.isBackupActive()) {
      await this.storageService.restoreItemsFromCloud([
        tracksKey,
        artistsKey,
        genresKey,
        lastUpdatedKey
      ]);
      if (!isCurrentLoad()) return;

      lastUpdated = this.storageService.getItem(lastUpdatedKey);
      isExpired = this.isCacheExpired(lastUpdated, range);
      cachedTracks = this.storageService.getItem(tracksKey);
      cachedArtists = this.storageService.getItem(artistsKey);
      cachedGenres = this.storageService.getItem(genresKey);
      parseCachedStats();
      await enrichParsedGenres();
      if (!isCurrentLoad()) return;
    }

    if (!isExpired && !isCacheIncomplete) {
      if (!isCurrentLoad()) return;
      console.log(`[Stats] Loading stats for ${range} from the local IndexedDB cache.`);
      try {
        this.topTracks = parsedTracks;
        this.topArtists = parsedArtists;
        this.topGenres = parsedGenres;
        this.saveHistorySnapshot(userId, range);
        this.isLoading = false;
        this.isRefreshingStats = false;
      } catch (e) {
        console.warn('Failed to parse validated user stats cache:', e);
        isCacheIncomplete = true;
      }
      if (!isCacheIncomplete) return;
    }
    
    if (isExpired || isCacheIncomplete) {
      // Prioritize Supabase data if backup is active
      if (this.authService.isBackupActive() && supabaseUserId) {
        updateLoadingState();
        const maxAgeDays = range === 'short_term' ? 1 : 7;
        const dbSnapshot = await this.supabaseService.loadLatestStatsSnapshot(
          supabaseUserId,
          range,
          maxAgeDays
        );
        if (!isCurrentLoad()) return;

        if (dbSnapshot) {
          console.log(`[Stats] Cache missing/expired. Fetching a recent stats snapshot for ${range} directly from Supabase Cloud...`);
          const loadedTracks = dbSnapshot.topTracks;
          let loadedArtists = dbSnapshot.topArtists;
          let loadedGenres = dbSnapshot.topGenres || [];
          if (loadedGenres.length === 0 && loadedArtists.some((artist: any) => !!artist?.id)) {
            try {
              const enriched = await this.enrichArtistGenres(loadedArtists);
              if (!isCurrentLoad()) return;
              loadedArtists = enriched.artists;
              loadedGenres = enriched.genres;
            } catch (error) {
              console.warn('[Stats] Could not enrich restored artist genres.', error);
            }
          }
          this.topTracks = loadedTracks;
          this.topArtists = loadedArtists;
          this.topGenres = loadedGenres;
            
          // Cache locally
          this.storageService.setItem(tracksKey, JSON.stringify(loadedTracks));
          this.storageService.setItem(artistsKey, JSON.stringify(loadedArtists));
          this.storageService.setItem(genresKey, JSON.stringify(loadedGenres));
          const parsedSnapshotTimestamp = dbSnapshot.snapshotDate
            ? new Date(`${dbSnapshot.snapshotDate}T01:00:00`).getTime()
            : Date.now();
          const snapshotTimestamp = Number.isFinite(parsedSnapshotTimestamp)
            ? parsedSnapshotTimestamp
            : Date.now();
          this.storageService.setItem(lastUpdatedKey, snapshotTimestamp.toString());

          this.saveHistorySnapshot(userId, range);
          this.isLoading = false;
          this.isRefreshingStats = false;
          return; // Skip Spotify API call entirely!
        }
      }

      console.log(`[Stats] Cache and database snapshot missing/expired. Loading stats for ${range} from Spotify API...`);
      updateLoadingState();
      if (!hasUsableCachedStats()) {
        this.topTracks = [];
        this.topArtists = [];
        this.topGenres = [];
      }

      const artistsReq = this.spotifyDataService.getUserTopArtists(range, 50, 0);
      const tracksReq = this.spotifyDataService.getUserTopTracks(range, 50, 0);
      const tracksReq2 = this.spotifyDataService.getUserTopTracks(range, 50, 50);

      this.statsSubscription = forkJoin({
        artists: artistsReq,
        tracks: tracksReq,
        tracksPage2: tracksReq2
      }).subscribe({
        next: async (res: any) => {
          if (!isCurrentLoad()) return;

          let loadedArtists = res.artists.items || [];
          const page1 = res.tracks.items || [];
          const page2 = res.tracksPage2.items || [];
          const loadedTracks = [...page1, ...page2];
          let calculatedGenres = this.buildGenres(loadedArtists);
          if (calculatedGenres.length === 0 && loadedArtists.some((artist: any) => !!artist?.id)) {
            try {
              const enriched = await this.enrichArtistGenres(loadedArtists);
              if (!isCurrentLoad()) return;
              loadedArtists = enriched.artists;
              calculatedGenres = enriched.genres;
            } catch (error) {
              console.warn('[Stats] Could not enrich artist genres; keeping the last usable genre cache.', error);
            }
          }
          // Do not let a transient/deprecated empty genres payload erase the
          // last usable genre view. Tracks and artists still refresh normally.
          const loadedGenres = calculatedGenres.length > 0
            ? calculatedGenres
            : parsedGenres;

          this.topArtists = loadedArtists;
          this.topTracks = loadedTracks;
          this.topGenres = loadedGenres;

          // Cache the results
          this.storageService.setItem(tracksKey, JSON.stringify(loadedTracks));
          this.storageService.setItem(artistsKey, JSON.stringify(loadedArtists));
          this.storageService.setItem(genresKey, JSON.stringify(loadedGenres));
          this.storageService.setItem(lastUpdatedKey, Date.now().toString());

          this.saveHistorySnapshot(userId, range);
          this.isLoading = false;
          this.isRefreshingStats = false;
          // If backup is active, sync to Supabase
          if (this.authService.isBackupActive() && supabaseUserId) {
            let explicitCount = 0;
            loadedTracks.forEach(track => {
              if (track.explicit) explicitCount++;
            });
            const explicitPercentage = loadedTracks.length > 0 ? Math.round((explicitCount / loadedTracks.length) * 100) : 0;
            const genreDiversity = loadedGenres.length;

            try {
              await this.supabaseService.saveStatsSnapshot(
                supabaseUserId,
                range,
                explicitPercentage,
                genreDiversity,
                loadedTracks,
                loadedArtists,
                loadedGenres
              );
            } catch (error) {
              console.warn('[Stats] Failed to persist fresh stats snapshot:', error);
            }
          }
        },
        error: (err) => {
          if (!isCurrentLoad()) return;

          console.error('Failed to load user stats:', err);
          this.isLoading = false;
          this.isRefreshingStats = false;
          // Fallback if API fails but we have stale cache
          if (
            Array.isArray(parsedTracks) &&
            Array.isArray(parsedArtists) &&
            Array.isArray(parsedGenres) &&
            (parsedTracks.length > 0 || parsedArtists.length > 0 || parsedGenres.length > 0)
          ) {
            this.topTracks = parsedTracks;
            this.topArtists = parsedArtists;
            this.topGenres = parsedGenres;
          }
        }
      });
    }
  }

  calculateGenres() {
    this.topGenres = this.buildGenres(this.topArtists);
  }

  private async enrichArtistGenres(artists: any[]): Promise<{artists: any[]; genres: any[]}> {
    const directGenres = this.buildGenres(artists);
    if (directGenres.length > 0) return {artists, genres: directGenres};

    const ids = artists.map((artist: any) => artist?.id).filter(Boolean);
    if (ids.length === 0) return {artists, genres: []};
    const enriched = await firstValueFrom(this.spotifyDataService.getArtistsByIds(ids));
    const enrichedById = new Map<string, any>(
      (enriched?.artists || []).map((artist: any) => [artist.id, artist])
    );
    const enrichedArtists = artists.map((artist: any) => ({
      ...artist,
      ...(enrichedById.get(artist.id) || {})
    }));
    return {artists: enrichedArtists, genres: this.buildGenres(enrichedArtists)};
  }

  private buildGenres(artists: any[]): { name: string; count: number; percentage: number; percentage_simple: number }[] {
    const genreCounts = new Map<string, number>();

    // Spotify supplies genres on the top-artist objects. Weight them by rank.
    artists.forEach((artist, index) => {
      const rankWeight = 50 - index;
      if (Array.isArray(artist.genres)) {
        artist.genres.forEach((genre: string) => {
          if (genre && genre.trim().toLowerCase() !== 'artist') {
            genreCounts.set(genre, (genreCounts.get(genre) || 0) + rankWeight);
          }
        });
      }
    });

    const sortedGenres = Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1]);
    const totalWeight = sortedGenres.reduce((sum, entry) => sum + entry[1], 0);
    const maxWeight = sortedGenres.length > 0 ? sortedGenres[0][1] : 1;

    return sortedGenres.slice(0, 15).map(([name, weight]) => ({
      name,
      count: Math.round(weight),
      percentage: totalWeight > 0 ? Math.min(100, Math.round((weight / totalWeight) * 100)) : 0,
      percentage_simple: weight > 0
        ? Math.max(2, Math.min(100, Math.round((weight / maxWeight) * 100)))
        : 0
    }));
  }

  openTrackClick(url: string) {
    if (url) {
      window.location.href = url;
    }
  }

  openArtistClick(url: string) {
    if (url) {
      window.location.href = url;
    }
  }


  createTopPlaylist() {
    if (this.topTracks.length === 0) return;
    this.isCreatingPlaylist = true;
    this.playlistCreationSuccessMessage = '';
    
    const rangeLabel = this.selectedRange === 'short_term' ? 'Last 4 Weeks' : 
                       this.selectedRange === 'medium_term' ? 'Last 6 Months' : 'Last Year';
    const playlistName = `Top Tracks - ${rangeLabel}`;
    const description = `My top tracks on Spotify for ${rangeLabel}, generated by Analytify.`;

    this.spotifyDataService.createPlaylist(playlistName, description).subscribe({
      next: (playlist: any) => {
        const trackUris = this.topTracks.map(t => t.uri || (t.external_urls?.spotify ? `spotify:track:${t.external_urls.spotify.split('/').pop()?.split('?')[0]}` : ''))
                                        .filter(uri => !!uri);

        if (trackUris.length === 0) {
          this.isCreatingPlaylist = false;
          alert('No track URIs found to add.');
          return;
        }

        this.spotifyDataService.addTracksToPlaylist(playlist.id, trackUris).subscribe({
          next: () => {
            this.isCreatingPlaylist = false;
            this.playlistCreationSuccessMessage = `Successfully created playlist "${playlistName}"!`;
            setTimeout(() => this.playlistCreationSuccessMessage = '', 5000);
          },
          error: (err: any) => {
            console.error('Failed to add tracks to playlist:', err);
            this.isCreatingPlaylist = false;
            alert('Failed to add tracks to the created playlist.');
          }
        });
      },
      error: (err: any) => {
        console.error('Failed to create playlist:', err);
        this.isCreatingPlaylist = false;
        alert('Failed to create playlist. Make sure you have authorized playlist modification scopes.');
      }
    });
  }

  toggleHistoryMenu(event: Event) {
    event.stopPropagation();
    this.showCompareMenu = false;
    if (!this.showHistoryMenu) {
      this.refreshHistoryCalendar(true);
    }
    this.showHistoryMenu = !this.showHistoryMenu;
  }

  selectHistorySnapshot(snapshotId: string, event: Event) {
    event.stopPropagation();
    this.selectedSnapshotId = snapshotId;
    // Pick best compare directly, skipping '' to avoid flicker
    const bestCompare = this.snapshotOptions.find(opt => opt.id !== snapshotId);
    this.compareSnapshotId = bestCompare ? bestCompare.id : (snapshotId !== 'current' ? 'current' : '');
    this.showHistoryMenu = false;
    if (snapshotId === 'current') this.schedulePastStatsSearch();
    else this.resetPastStatsSearch();
    this.calculateHotMovers();
    this.ensureSnapshotLoaded(snapshotId);
    if (this.compareSnapshotId) this.ensureSnapshotLoaded(this.compareSnapshotId);
    this.updateSnapshotGroups();
  }

  toggleCompareMenu(event: Event) {
    event.stopPropagation();
    this.showHistoryMenu = false;
    if (!this.showCompareMenu) {
      this.refreshCompareCalendar(true);
    }
    this.showCompareMenu = !this.showCompareMenu;
  }

  selectCompareSnapshot(snapshotId: string, event: Event) {
    event.stopPropagation();
    this.compareSnapshotId = snapshotId;
    this.showCompareMenu = false;
    this.calculateHotMovers();
    this.ensureSnapshotLoaded(snapshotId);
    this.updateSnapshotGroups();
  }

  updateSnapshotGroups() {
    this.refreshHistoryCalendar();
    this.refreshCompareCalendar();
  }

  canNavigateHistoryCalendar(direction: -1 | 1): boolean {
    return this.canNavigateSnapshotCalendar('history', direction);
  }

  navigateHistoryCalendar(direction: -1 | 1, event: Event): void {
    this.navigateSnapshotCalendar('history', direction, event);
  }

  selectHistoryCalendarDay(day: SnapshotCalendarDay, event: Event): void {
    event.stopPropagation();
    if (!day.isAvailable || !day.optionId) return;
    this.selectHistorySnapshot(day.optionId, event);
  }

  canNavigateCompareCalendar(direction: -1 | 1): boolean {
    return this.canNavigateSnapshotCalendar('compare', direction);
  }

  navigateCompareCalendar(direction: -1 | 1, event: Event): void {
    this.navigateSnapshotCalendar('compare', direction, event);
  }

  selectCompareCalendarDay(day: SnapshotCalendarDay, event: Event): void {
    event.stopPropagation();
    if (!day.isAvailable || !day.optionId) return;
    this.selectCompareSnapshot(day.optionId, event);
  }

  private canNavigateSnapshotCalendar(target: SnapshotCalendarTarget, direction: -1 | 1): boolean {
    const months = this.getAvailableSnapshotMonths(target);
    const currentMonth = this.getSnapshotCalendarMonth(target);
    const currentIndex = months.findIndex(month => month.getTime() === currentMonth.getTime());
    return currentIndex >= 0 && currentIndex + direction >= 0 && currentIndex + direction < months.length;
  }

  private navigateSnapshotCalendar(target: SnapshotCalendarTarget, direction: -1 | 1, event: Event): void {
    event.stopPropagation();
    const months = this.getAvailableSnapshotMonths(target);
    const currentMonth = this.getSnapshotCalendarMonth(target);
    const currentIndex = months.findIndex(month => month.getTime() === currentMonth.getTime());
    const nextMonth = months[currentIndex + direction];
    if (!nextMonth) return;

    this.setSnapshotCalendarMonth(target, nextMonth);
    this.refreshSnapshotCalendar(target);
  }

  private refreshHistoryCalendar(focusSelection = false): void {
    this.refreshSnapshotCalendar('history', focusSelection);
  }

  private refreshCompareCalendar(focusSelection = false): void {
    this.refreshSnapshotCalendar('compare', focusSelection);
  }

  private refreshSnapshotCalendar(target: SnapshotCalendarTarget, focusSelection = false): void {
    const options = this.getSnapshotCalendarOptions(target);
    if (options.length === 0) {
      this.setSnapshotCalendarView(target, '', []);
      return;
    }

    const availableByDate = new Map<string, string>();
    options.forEach(option => {
      const dateKey = this.getSnapshotOptionDateKey(option);
      if (dateKey) availableByDate.set(dateKey, option.id);
    });

    const selectedId = target === 'history' ? this.selectedSnapshotId : this.compareSnapshotId;
    const months = this.getAvailableSnapshotMonths(target, options);
    const selectedOption = options.find(option => option.id === selectedId);
    const selectedDateKey = selectedOption ? this.getSnapshotOptionDateKey(selectedOption) : null;
    const selectedMonth = selectedDateKey ? this.monthFromDateKey(selectedDateKey) : null;
    let currentMonth = this.getSnapshotCalendarMonth(target);
    const currentMonthExists = months.some(month => month.getTime() === currentMonth.getTime());

    if ((focusSelection && selectedMonth) || !currentMonthExists) {
      currentMonth = selectedMonth || months[months.length - 1];
      this.setSnapshotCalendarMonth(target, currentMonth);
    }

    const monthLabel = currentMonth.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric'
    });

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = toDailySnapshotDateKey(Date.now());
    const cells: Array<SnapshotCalendarDay | null> = Array.from({length: firstDayOffset}, () => null);

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
      const date = new Date(year, month, dayNumber, 12);
      const dateKey = toDailySnapshotDateKey(date.getTime());
      const optionId = availableByDate.get(dateKey) || null;
      cells.push({
        dateKey,
        dayNumber,
        optionId,
        isAvailable: !!optionId,
        isSelected: optionId === selectedId,
        isToday: dateKey === todayKey,
        ariaLabel: `${date.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}${optionId ? ', available' : ', unavailable'}`
      });
    }

    this.setSnapshotCalendarView(target, monthLabel, cells);
  }

  private getAvailableSnapshotMonths(
    target: SnapshotCalendarTarget,
    options = this.getSnapshotCalendarOptions(target)
  ): Date[] {
    const months = new Map<number, Date>();
    options.forEach(option => {
      const dateKey = this.getSnapshotOptionDateKey(option);
      if (!dateKey) return;
      const month = this.monthFromDateKey(dateKey);
      months.set(month.getTime(), month);
    });
    return Array.from(months.values()).sort((left, right) => left.getTime() - right.getTime());
  }

  private getSnapshotCalendarOptions(target: SnapshotCalendarTarget): any[] {
    return target === 'history' ? this.getHistoryOptions() : this.getCompareOptions();
  }

  private getSnapshotCalendarMonth(target: SnapshotCalendarTarget): Date {
    return target === 'history' ? this.historyCalendarMonth : this.compareCalendarMonth;
  }

  private setSnapshotCalendarMonth(target: SnapshotCalendarTarget, month: Date): void {
    if (target === 'history') this.historyCalendarMonth = month;
    else this.compareCalendarMonth = month;
  }

  private setSnapshotCalendarView(
    target: SnapshotCalendarTarget,
    label: string,
    days: Array<SnapshotCalendarDay | null>
  ): void {
    if (target === 'history') {
      this.historyCalendarMonthLabel = label;
      this.historyCalendarDays = days;
    } else {
      this.compareCalendarMonthLabel = label;
      this.compareCalendarDays = days;
    }
  }

  private getSnapshotOptionDateKey(option: any): string | null {
    if (option.id === 'current') return toDailySnapshotDateKey(Date.now());
    return option.dateKey || this.getSnapshotDateKey(option.id);
  }

  private monthFromDateKey(dateKey: string): Date {
    const [year, month] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  /** Returns the most recent historical snapshot id that is NOT the currently selected snapshot. */
  private getDefaultCompareId(): string {
    const opts = this.getCompareOptions();
    return opts.length > 0 ? opts[0].id : '';
  }

  /** Auto-selects the most appropriate comparison snapshot if none is currently set. */
  autoSetDefaultCompare() {
    if (this.compareSnapshotId) return; // already set, don't overwrite
    this.compareSnapshotId = this.getDefaultCompareId();
    if (this.compareSnapshotId) {
      this.ensureSnapshotLoaded(this.compareSnapshotId);
    }
  }

  getHistoryOptions(): any[] {
    return [
      {id: 'current', label: 'Today', dateKey: toDailySnapshotDateKey(Date.now())},
      ...this.snapshotOptions.map(option => ({
        id: option.id,
        label: option.label,
        dateKey: option.dateKey
      }))
    ];
  }

  getCompareOptions(): any[] {
    // Historical snapshots excluding the currently selected one, newest first
    const historicalOptions = this.snapshotOptions.filter(opt => opt.id !== this.selectedSnapshotId);

    const options: any[] = historicalOptions.map(opt => ({
      id: opt.id,
      label: opt.label,
      dateKey: opt.dateKey
    }));

    if (this.selectedSnapshotId !== 'current') {
      options.push({ id: 'current', label: 'Today' });
    }

    return options;
  }

  getCompareSnapshotLabel(): string {
    if (!this.compareSnapshotId) {
      return 'None';
    }
    if (this.compareSnapshotId === 'current') {
      return 'Today';
    }
    const found = this.snapshotOptions.find(opt => opt.id === this.compareSnapshotId);
    return found ? found.label : 'Select Snapshot';
  }

  private getComparisonSnapshotObjectWithoutLazyLoading(): any {
    if (!this.historyData || this.historyData.length === 0) {
      return null;
    }

    // Empty string means no comparison snapshot selected
    if (!this.compareSnapshotId) {
      return null;
    }

    if (this.compareSnapshotId === 'current') {
      return {
        topTracks: this.topTracks.map(t => ({
          id: t.id,
          linkedFromId: t.linked_from?.id || t.linkedFromId || '',
          name: t.name,
          artist: this.getTrackArtist(t),
          albumCover: this.getTrackCover(t),
          explicit: t.explicit || false,
          spotifyUrl: this.getTrackUrl(t)
        })),
        topArtists: this.topArtists.map(a => ({
          id: a.id,
          name: a.name,
          imageUrl: this.getArtistImage(a),
          spotifyUrl: this.getArtistUrl(a)
        })),
        topGenres: this.topGenres.map(g => ({
          name: g.name,
          percentage: g.percentage,
          count: g.count
        }))
      };
    }

    return this.historyData.find(d => d.timestamp.toString() === this.compareSnapshotId) || null;
  }

  getComparisonSnapshot(): any {
    const snap = this.getComparisonSnapshotObjectWithoutLazyLoading();
    if (!snap) return null;

    if (this.compareSnapshotId === 'current') {
      return snap;
    }

    if (snap.isLoaded === false) {
      this.lazyLoadSnapshotDetails(snap.timestamp.toString());
    }
    return snap.isLoaded === true ? snap : null;
  }

  calculateHotMovers() {
    this.hotMoverTracks.clear();
    this.hotMoverArtists.clear();
    this.highDebutTracks.clear();
    this.highDebutArtists.clear();

    const tracks = this.displayedTracks;
    const artists = this.displayedArtists;

    if (!this.historyData || this.historyData.length === 0) {
      return;
    }

    const selectHotCandidates = (items: any[], category: 'tracks' | 'artists') => {
      const candidates: Array<{item: any; isHighDebut: boolean; score: number; rank: number}> = [];

      items.forEach((item, idx) => {
        const trend = this.getTrend(item, idx, category);
        const isNewEntry = trend.type === 'new';
        const isHighDebut = isNewEntry && idx < this.highDebutRankLimit;
        const isStrongRise = trend.type === 'up' && trend.diff !== undefined && trend.diff >= 15;
        if (!isNewEntry && !isStrongRise) return;

        // Spotify Top Songs uses 100 positions. Treat a debut as moving from
        // the first position below that list so its gain is directly
        // comparable with an existing entry's previous-rank minus new-rank.
        const score = isNewEntry
          ? this.newEntryBaselineRank - (idx + 1)
          : trend.diff || 0;
        candidates.push({item, isHighDebut, score, rank: idx});
      });

      return candidates
        .sort((a, b) => b.score - a.score || a.rank - b.rank)
        .slice(0, this.hotMoverDisplayLimit);
    };

    selectHotCandidates(tracks, 'tracks').forEach(candidate => {
      const track = candidate.item;
      const key = track.id || `${track.name}_${this.getTrackArtist(track)}`;
      this.hotMoverTracks.add(key);
      if (candidate.isHighDebut) this.highDebutTracks.add(key);
    });

    selectHotCandidates(artists, 'artists').forEach(candidate => {
      const artist = candidate.item;
      const key = artist.id || artist.name;
      this.hotMoverArtists.add(key);
      if (candidate.isHighDebut) this.highDebutArtists.add(key);
    });
  }

  isHotMover(item: any, category: string): boolean {
    if (category === 'tracks') {
      const key = item.id || `${item.name}_${this.getTrackArtist(item)}`;
      return this.hotMoverTracks.has(key);
    } else if (category === 'artists') {
      const key = item.id || item.name;
      return this.hotMoverArtists.has(key);
    }
    return false;
  }

  isHighDebutHotSong(track: any): boolean {
    const key = track.id || `${track.name}_${this.getTrackArtist(track)}`;
    return this.highDebutTracks.has(key);
  }

  isHighDebutHotArtist(artist: any): boolean {
    const key = artist.id || artist.name;
    return this.highDebutArtists.has(key);
  }

  getSelectedSnapshotLabel(): string {
    if (this.selectedSnapshotId === 'current') {
      return 'Today';
    }
    const found = this.snapshotOptions.find(opt => opt.id === this.selectedSnapshotId);
    return found ? found.label : 'Today';
  }

  showBackupConfirmModal = false;



  saveHistorySnapshot(userId: string, range: string) {
    if (this.topTracks.length === 0 && this.topArtists.length === 0) {
      this.loadHistoryData();
      return;
    }

    let explicitCount = 0;
    this.topTracks.forEach(track => {
      if (track.explicit) explicitCount++;
    });
    const explicitPercentage = this.topTracks.length > 0 ? Math.round((explicitCount / this.topTracks.length) * 100) : 0;
    const genreDiversity = this.topGenres.length;
    const snapshotItems = {
      topGenres: this.topGenres.map(g => ({
        name: g.name,
        percentage: g.percentage,
        count: g.count
      })),
      topTracks: this.topTracks.map(t => ({
        id: t.id,
        linkedFromId: t.linked_from?.id || t.linkedFromId || '',
        name: t.name,
        artist: this.getTrackArtist(t),
        albumCover: t.album?.images && t.album.images[0] ? t.album.images[0].url : '',
        explicit: t.explicit || false,
        spotifyUrl: t.external_urls?.spotify || ''
      })),
      topArtists: this.topArtists.map(a => ({
        id: a.id,
        name: a.name,
        imageUrl: a.images && a.images[0] ? a.images[0].url : '',
        spotifyUrl: a.external_urls?.spotify || ''
      }))
    };

    this.writeRealSnapshot(userId, range, explicitPercentage, genreDiversity, snapshotItems);
  }

  private writeRealSnapshot(
    userId: string,
    range: string,
    explicitPercentage: number,
    genreDiversity: number,
    snapshotItems: { topGenres: any[]; topTracks: any[]; topArtists: any[] }
  ) {
    this.historyWriteQueue = this.historyWriteQueue.then(() =>
      this.storageService.getStatsHistory(userId, range).then(history => {
      const targetSnapshotDate = toDailySnapshotDateKey(Date.now());
      const existingToday = history.slice().reverse().find(entry =>
        (entry.snapshotDate || toDailySnapshotDateKey(entry.timestamp)) === targetSnapshotDate
      ) || null;

      const snapshot: any = {
        userId: userId,
        range: range,
        timestamp: existingToday?.timestamp || Date.now(),
        snapshotDate: targetSnapshotDate,
        explicitPercentage: explicitPercentage,
        genreDiversity: genreDiversity,
        topGenres: snapshotItems.topGenres,
        topTracks: snapshotItems.topTracks,
        topArtists: snapshotItems.topArtists
      };
      if (existingToday?.id !== undefined) {
        snapshot.id = existingToday.id;
      }

      return this.storageService.saveStatsHistory(snapshot).then(() => {
        console.log(existingToday
          ? 'Updated today\'s history snapshot in IndexedDB'
          : 'Saved history snapshot to IndexedDB');
        this.loadHistoryData();
      });
      })
    ).catch(error => {
      console.warn('[Stats] Failed to persist local history snapshot:', error);
    });
  }

  loadHistoryData() {
    if (this.isSpyMode) return;
    const loadSequence = ++this.historyLoadSequence;
    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const range = this.selectedRange;
    const isCurrentLoad = () =>
      loadSequence === this.historyLoadSequence && range === this.selectedRange;

    const loadLocal = () => {
      return this.storageService.getStatsHistory(userId, range).then(async history => {
        if (!isCurrentLoad()) return;

        const snapshotsByDate = new Map<string, any>();
        (history || []).forEach((snapshot: any) => {
          const dateKey = snapshot.snapshotDate || toDailySnapshotDateKey(snapshot.timestamp);
          const existing = snapshotsByDate.get(dateKey);
          const snapshotHasDetails = Array.isArray(snapshot.topTracks) && snapshot.topTracks.length > 0;
          const existingHasDetails = Array.isArray(existing?.topTracks) && existing.topTracks.length > 0;
          if (!existing || snapshotHasDetails || !existingHasDetails) {
            snapshotsByDate.set(dateKey, { ...snapshot, snapshotDate: dateKey });
          }
        });
        const retainedIds = new Set(
          Array.from(snapshotsByDate.values())
            .map(snapshot => snapshot.id)
            .filter(id => id !== undefined)
        );
        const duplicateIds = (history || [])
          .map((snapshot: any) => snapshot.id)
          .filter((id: IDBValidKey | undefined): id is IDBValidKey =>
            id !== undefined && !retainedIds.has(id)
          );
        if (duplicateIds.length > 0) {
          await this.storageService.deleteStatsHistoryEntries(duplicateIds);
        }
        if (!isCurrentLoad()) return;

        // Mark snapshots that already have topTracks array as fully loaded
        this.historyData = Array.from(snapshotsByDate.values())
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(h => ({
          ...h,
          isLoaded: (h.topTracks && h.topTracks.length > 0) ? true : (h.isLoaded || false)
        }));
        
        // Compare logical 01:00-day keys rather than midnight timestamps.
        // Cloud snapshots are normalized to local midnight and would otherwise
        // be misclassified as historical during the current day.
        const currentSnapshotDate = toDailySnapshotDateKey(Date.now());
        const historicalOnly = this.historyData.filter(d =>
          (d.snapshotDate || toDailySnapshotDateKey(d.timestamp)) < currentSnapshotDate
        );

        // Populate snapshot options with clean date format (no timestamp)
        this.snapshotOptions = historicalOnly.slice().reverse().map(d => ({
          id: d.timestamp.toString(),
          label: new Date(d.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
          dateKey: d.snapshotDate || toDailySnapshotDateKey(d.timestamp)
        }));

        this.updateSnapshotGroups();

        // Auto-select the best default compare snapshot if not already set
        if (!this.compareSnapshotId) {
          this.autoSetDefaultCompare();
        }

        this.calculateHotMovers();

        // Trigger lazy loading for startup selected snapshots
        this.ensureSnapshotLoaded(this.selectedSnapshotId);
        if (this.compareSnapshotId) {
          this.ensureSnapshotLoaded(this.compareSnapshotId);
        }
      }).catch(err => {
        console.error('Failed to load stats history:', err);
      });
    };

    // 1. Load local history IMMEDIATELY so comparison dropdown is responsive instantly
    loadLocal().then(() => {
      if (!isCurrentLoad()) return;

      // 2. Perform sync in background
      // The locally cached backup flag is sufficient to begin this lightweight
      // metadata query. Initial account hydration continues independently and
      // ngOnInit retries once if it discovers backup was enabled.
      const ready = Promise.resolve();
      ready.then(() => {
        if (!isCurrentLoad()) return;

        const isBackupActive = this.authService.isBackupActive();
        if (isBackupActive && supabaseUserId) {
          // Fetch only the lightweight metadata from Supabase
          this.supabaseService.loadAllStatsSnapshotsMetadata(supabaseUserId, range).then(async (dbSnapshots) => {
            if (!isCurrentLoad()) return;

            const localHistory = await this.storageService.getStatsHistory(userId, range).catch(() => [] as any[]);
            if (!isCurrentLoad()) return;

            const toDateKey = toDailySnapshotDateKey;

            const cloudDateKeys = new Set((dbSnapshots || []).map((s: any) =>
              s.snapshotDate || toDateKey(s.timestamp)
            ));

            let localUpdated = false;

            // Step 1: Download cloud snapshots missing from local IndexedDB (as metadata-only placeholder)
            if (dbSnapshots && dbSnapshots.length > 0) {
              try {
                const localDateKeys = new Set(localHistory.map((h: any) =>
                  h.snapshotDate || toDateKey(h.timestamp)
                ));
                const missingSnapshots = dbSnapshots.filter((snap: any) => {
                  const key = snap.snapshotDate || toDateKey(snap.timestamp);
                  return !localDateKeys.has(key);
                });
                await mapWithConcurrency(missingSnapshots, async (snap: any) => {
                  await this.storageService.saveStatsHistory({ ...snap, userId, isLoaded: false });
                  localUpdated = true;
                });
              } catch (e) {
                console.warn('[Stats] Failed to restore DB history snapshots locally:', e);
              }
            }

            // Step 2: Upload local-only snapshots to cloud
            try {
              const localOnlySnapshots = localHistory.filter((h: any) =>
                !cloudDateKeys.has(h.snapshotDate || toDateKey(h.timestamp))
              );

              await mapWithConcurrency(localOnlySnapshots, async (localSnap: any) => {
                const dateStr = localSnap.snapshotDate || toDateKey(localSnap.timestamp);
                let explicitCount = 0;
                (localSnap.topTracks || []).forEach((t: any) => {
                  if (t.explicit) explicitCount++;
                });
                const trackCount = (localSnap.topTracks || []).length;
                const explPct = trackCount > 0 ? Math.round((explicitCount / trackCount) * 100) : 0;
                const genreDiversity = (localSnap.topGenres || []).length;

                console.log(`[Stats] Uploading local-only snapshot to cloud: ${dateStr} (${range})`);
                await this.supabaseService.saveStatsSnapshot(
                  supabaseUserId,
                  range,
                  explPct,
                  genreDiversity,
                  localSnap.topTracks || [],
                  localSnap.topArtists || [],
                  localSnap.topGenres || [],
                  true,    // onlyInsertMissing — don't overwrite existing metadata objects
                  dateStr  // customDateStr — use the real historical date, not today
                );
              }, 2);
            } catch (e) {
              console.warn('[Stats] Failed to upload local-only snapshots to cloud:', e);
            }

            if (localUpdated) {
              await loadLocal();
              if (!isCurrentLoad()) return;
            }

            // Full snapshot payloads stay lazy. Only the selected and compare
            // snapshots are loaded by ensureSnapshotLoaded(), which prevents
            // hundreds of Top-100 joins and IndexedDB writes on page entry.
          }).catch(err => {
            console.warn('[Stats] Failed to load history snapshots from Supabase:', err);
          });
        }
      });
    });
  }


  getTrend(item: any, currentIdx: number, category: StatsCategory): StatsTrend {
    if (!this.historyData || this.historyData.length === 0) {
      return { type: 'same' };
    }

    const prevSnapshot = this.getComparisonSnapshot();

    if (!prevSnapshot) {
      return { type: 'same' };
    }

    const comparisonItems = this.getSnapshotItems(prevSnapshot, category);
    const comparisonIdx = this.findStatsItemIndex(comparisonItems, item, category);
    const selectedDateKey = this.getSnapshotDateKey(this.selectedSnapshotId);
    const comparisonDateKey = this.getSnapshotDateKey(this.compareSnapshotId);

    if (comparisonIdx === -1) {
      // "New" is chronological, not just "missing from the chosen comparison".
      // A returning item, an item from an older selected snapshot, or an item
      // whose earlier snapshots are still loading must not get a false blue dot.
      if (!selectedDateKey || !comparisonDateKey || selectedDateKey <= comparisonDateKey) {
        return { type: 'same' };
      }
      return this.getPriorAppearance(item, category, selectedDateKey) === 'absent'
        ? { type: 'new' }
        : { type: 'same' };
    }

    // Always describe movement from the older snapshot to the newer one, even
    // when the user selected the snapshots in reverse chronological order.
    const selectedIsNewer = !selectedDateKey || !comparisonDateKey || selectedDateKey >= comparisonDateKey;
    const olderIdx = selectedIsNewer ? comparisonIdx : currentIdx;
    const newerIdx = selectedIsNewer ? currentIdx : comparisonIdx;

    if (newerIdx < olderIdx) {
      return { type: 'up', diff: olderIdx - newerIdx };
    }
    if (newerIdx > olderIdx) {
      return { type: 'down', diff: newerIdx - olderIdx };
    }
    return { type: 'same' };
  }

  private getSnapshotItems(snapshot: any, category: StatsCategory): any[] {
    if (!snapshot) return [];
    if (category === 'tracks') return snapshot.topTracks || [];
    if (category === 'artists') return snapshot.topArtists || [];
    return snapshot.topGenres || [];
  }

  private normalizeStatsIdentity(value: unknown): string {
    return typeof value === 'string'
      ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
      : '';
  }

  private getStatsItemName(item: any, category: StatsCategory): string {
    if (category === 'genres' && typeof item === 'string') {
      return this.normalizeStatsIdentity(item);
    }
    return this.normalizeStatsIdentity(item?.name);
  }

  private getTrackIdentityIds(track: any): string[] {
    return [track?.id, track?.linked_from?.id, track?.linkedFromId]
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  private statsItemsMatch(left: any, right: any, category: StatsCategory): boolean {
    if (!left || !right) return false;

    if (category === 'tracks') {
      const leftIds = this.getTrackIdentityIds(left);
      const rightIds = new Set(this.getTrackIdentityIds(right));
      if (leftIds.some(id => rightIds.has(id))) return true;

      const leftName = this.getStatsItemName(left, category);
      const rightName = this.getStatsItemName(right, category);
      const leftArtist = this.normalizeStatsIdentity(this.getTrackArtist(left));
      const rightArtist = this.normalizeStatsIdentity(this.getTrackArtist(right));
      return !!leftName && !!leftArtist && leftName === rightName && leftArtist === rightArtist;
    }

    if (category === 'artists' && left.id && right.id && left.id === right.id) {
      return true;
    }

    const leftName = this.getStatsItemName(left, category);
    return !!leftName && leftName === this.getStatsItemName(right, category);
  }

  private findStatsItemIndex(items: any[], item: any, category: StatsCategory): number {
    return items.findIndex(candidate => this.statsItemsMatch(candidate, item, category));
  }

  private getSnapshotDateKey(snapshotId: string): string | null {
    if (snapshotId === 'current') {
      return toDailySnapshotDateKey(Date.now());
    }

    const snapshot = this.historyData.find(d => d.timestamp.toString() === snapshotId);
    if (snapshot) {
      return snapshot.snapshotDate || toDailySnapshotDateKey(snapshot.timestamp);
    }

    const timestamp = Number(snapshotId);
    return Number.isFinite(timestamp) ? toDailySnapshotDateKey(timestamp) : null;
  }

  private getPriorAppearance(
    item: any,
    category: StatsCategory,
    selectedDateKey: string
  ): 'present' | 'absent' | 'unknown' {
    let hasUnloadedSnapshot = false;

    for (const snapshot of this.historyData) {
      const snapshotDateKey = snapshot.snapshotDate || toDailySnapshotDateKey(snapshot.timestamp);
      if (snapshotDateKey >= selectedDateKey) continue;

      if (snapshot.isLoaded !== true) {
        hasUnloadedSnapshot = true;
        continue;
      }

      if (this.findStatsItemIndex(this.getSnapshotItems(snapshot, category), item, category) !== -1) {
        return 'present';
      }
    }

    return hasUnloadedSnapshot ? 'unknown' : 'absent';
  }

  get displayedTracks(): any[] {
    if (this.selectedSnapshotId === 'current') {
      return this.topTracks;
    }
    const snap = this.historyData.find(d => d.timestamp.toString() === this.selectedSnapshotId);
    if (snap) {
      if (snap.isLoaded === false) {
        this.lazyLoadSnapshotDetails(snap.timestamp.toString());
      }
      return snap.isLoaded === true ? (snap.topTracks || []) : [];
    }
    return this.topTracks;
  }

  get displayedArtists(): any[] {
    if (this.selectedSnapshotId === 'current') {
      return this.topArtists;
    }
    const snap = this.historyData.find(d => d.timestamp.toString() === this.selectedSnapshotId);
    if (snap) {
      if (snap.isLoaded === false) {
        this.lazyLoadSnapshotDetails(snap.timestamp.toString());
      }
      return snap.isLoaded === true ? (snap.topArtists || []) : [];
    }
    return this.topArtists;
  }

  get filteredTracks(): any[] {
    const query = this.normalizeStatsIdentity(this.statsSearchQuery);
    if (!query) return this.displayedTracks;
    return this.displayedTracks.filter(track =>
      this.normalizeStatsIdentity(track?.name).includes(query) ||
      this.normalizeStatsIdentity(this.getTrackArtist(track)).includes(query)
    );
  }

  get filteredArtists(): any[] {
    const query = this.normalizeStatsIdentity(this.statsSearchQuery);
    if (!query) return this.displayedArtists;
    return this.displayedArtists.filter(artist =>
      this.normalizeStatsIdentity(artist?.name).includes(query)
    );
  }

  get isStatsSearchActive(): boolean {
    return this.normalizeStatsIdentity(this.statsSearchQuery).length > 0;
  }

  clearStatsSearch(): void {
    this.statsSearchQuery = '';
    this.resetPastStatsSearch();
  }

  getStatsRankIndex(item: any, category: 'tracks' | 'artists'): number {
    const items = category === 'tracks' ? this.displayedTracks : this.displayedArtists;
    return this.findStatsItemIndex(items, item, category);
  }

  get displayedGenres(): any[] {
    let rawGenres: any[] = [];
    if (this.selectedSnapshotId === 'current') {
      rawGenres = this.topGenres;
    } else {
      const snapshot = this.historyData.find(d => d.timestamp.toString() === this.selectedSnapshotId);
      if (snapshot) {
        if (snapshot.isLoaded === false) {
          this.lazyLoadSnapshotDetails(snapshot.timestamp.toString());
        }
        rawGenres = snapshot.isLoaded === true ? (snapshot.topGenres || []) : [];
      }
    }

    if (rawGenres.length === 0) return [];

    const maxPercentage = rawGenres[0].percentage || 1;
    const previousSnapshot = this.getComparisonSnapshot();
    const previousGenres = previousSnapshot ? (previousSnapshot.topGenres || []) : [];

    return rawGenres.map((genre: any, index: number) => {
      const currentRank = index + 1;
      const currentPercentage = genre.percentage || 0;
      const previousIndex = this.findStatsItemIndex(previousGenres, genre, 'genres');
      const trend = this.getTrend(genre, index, 'genres');

      let previousPercentage = 0;

      if (previousIndex !== -1) {
        const previousGenre = previousGenres[previousIndex];
        previousPercentage = typeof previousGenre === 'string' ? 0 : (previousGenre.percentage || 0);
      }

      const percentageDiff = currentPercentage - previousPercentage;
      return {
        name: genre.name,
        percentage: currentPercentage,
        percentage_simple: currentPercentage > 0
          ? Math.max(2, Math.min(100, Math.round((currentPercentage / maxPercentage) * 100)))
          : 0,
        prevPercentageSimple: previousPercentage > 0
          ? Math.max(2, Math.min(100, Math.round((previousPercentage / maxPercentage) * 100)))
          : 0,
        rank: currentRank,
        trendType: trend.type,
        rankDiff: trend.diff || 0,
        percentageDiff,
        prevPercentage: previousPercentage,
        hasCompare: !!previousSnapshot
      };
    });
  }

  onSnapshotChange(event: Event) {
    this.selectedSnapshotId = (event.target as HTMLSelectElement).value;
  }

  onTrendCardKeydown(
    event: KeyboardEvent,
    item: any,
    category: 'tracks' | 'artists' | 'genres'
  ): void {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    void this.openTrendPopup(item, category);
  }

  async openTrendPopup(item: any, category: 'tracks' | 'artists' | 'genres') {
    if (this.isSpyMode) return;
    const range = this.selectedRange;
    this.trendPopupItem = item;
    this.trendPopupCategory = category;
    this.showTrendPopup = true;
    this.trendPopupPoints = [];

    const hasUnloaded = this.historyData.some(d => d.isLoaded !== true);
    const supabaseUserId = this.authService.getSupabaseUserId();
    let cloudPoints: any[] = [];

    if (hasUnloaded && this.authService.isBackupActive() && supabaseUserId) {
      this.isLoadingTrendData = true;
      try {
        const identities = category === 'tracks'
          ? this.getTrackIdentityIds(item)
          : category === 'artists'
            ? [item?.id]
            : [typeof item === 'string' ? item : item?.name];
        cloudPoints = await this.supabaseService.loadStatsItemTrend(
          supabaseUserId,
          range,
          category,
          identities
        );
        if (range !== this.selectedRange || !this.showTrendPopup) return;
      } catch (err) {
        console.error('Failed to load the item trend from cloud:', err);
      } finally {
        this.isLoadingTrendData = false;
      }
    }

    this.calculateTrendPoints(cloudPoints);
  }

  private async loadSharedStats(loadSequence: number): Promise<void> {
    this.isLoading = true;
    this.isRefreshingStats = false;
    this.sharedStatsError = '';
    this.topTracks = [];
    this.topArtists = [];
    this.topGenres = [];
    try {
      if (!this.statsSharing) throw new Error('Stats sharing is unavailable.');
      const snapshot = await this.statsSharing.loadSharedStats(this.spyOwnerUserId, this.selectedRange);
      if (loadSequence !== this.statsLoadSequence) return;
      if (!snapshot) throw new Error('This user does not have a saved snapshot for this range yet.');
      this.spyDisplayName = snapshot.ownerDisplayName;
      this.spyImageUrl = snapshot.ownerImageUrl;
      this.spySnapshotDate = snapshot.snapshotDate;
      this.topTracks = snapshot.topTracks;
      this.topArtists = snapshot.topArtists;
      this.topGenres = snapshot.topGenres;
    } catch (error) {
      if (loadSequence !== this.statsLoadSequence) return;
      const value = error as any;
      this.sharedStatsError = value?.message || 'These shared stats are unavailable.';
    } finally {
      if (loadSequence === this.statsLoadSequence) this.isLoading = false;
    }
  }

  calculateTrendPoints(seedPoints: any[] = []) {
    if (!this.trendPopupItem) return;
    const item = this.trendPopupItem;
    const category = this.trendPopupCategory;
    const pointsByDate = new Map<string, any>();
    seedPoints.forEach(point => {
      const timestamp = Number(point.timestamp);
      if (!Number.isFinite(timestamp) || !Number.isFinite(Number(point.rank))) return;
      const dateKey = point.snapshotDate || toDailySnapshotDateKey(timestamp);
      pointsByDate.set(dateKey, {
        date: new Date(timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}),
        rank: Number(point.rank),
        timestamp
      });
    });
    
    this.historyData.forEach(snap => {
      const list = category === 'tracks'
        ? (snap.topTracks || [])
        : category === 'artists'
          ? (snap.topArtists || [])
          : (snap.topGenres || []);
      const rankIdx = this.findStatsItemIndex(list, item, category);
      if (rankIdx !== -1) {
        pointsByDate.set(snap.snapshotDate || toDailySnapshotDateKey(snap.timestamp), {
          date: new Date(snap.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          rank: rankIdx + 1,
          timestamp: snap.timestamp
        });
      }
    });

    const currentList = category === 'tracks'
      ? this.topTracks
      : category === 'artists'
        ? this.topArtists
        : this.topGenres;
    const currentRankIdx = this.findStatsItemIndex(currentList, item, category);

    // Only append "Now" if we haven't already saved a snapshot today
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0); // 1:00 AM today
    if (now.getTime() < cutoff.getTime()) {
      cutoff.setDate(cutoff.getDate() - 1);
    }
    const lastSnap = this.historyData[this.historyData.length - 1];
    const hasTodaySnapshot = lastSnap && lastSnap.timestamp >= cutoff.getTime();

    if (!hasTodaySnapshot && currentRankIdx !== -1) {
      pointsByDate.set('current', {
        date: 'Now',
        rank: currentRankIdx + 1,
        timestamp: Date.now()
      });
    }

    this.trendPopupPoints = Array.from(pointsByDate.values())
      .sort((left, right) => left.timestamp - right.timestamp);
    this.calculateVisibleLabels();
  }

  closeTrendPopup(event?: Event) {
    if (event) event.stopPropagation();
    this.showTrendPopup = false;
    this.trendPopupItem = null;
    this.trendPopupPoints = [];
    this.hoveredPointIndex = null;
  }

  calculateVisibleLabels() {
    this.visibleLabelIndices.clear();
    const points = this.trendPopupPoints;
    const total = points.length;
    if (total === 0) return;

    this.visibleLabelIndices.add(0);
    this.visibleLabelIndices.add(total - 1);

    if (total <= 10) {
      for (let i = 0; i < total; i++) {
        this.visibleLabelIndices.add(i);
      }
      return;
    }

    const minStep = Math.max(2, Math.ceil(total / 8));

    interface Candidate {
      index: number;
      score: number;
    }
    const candidates: Candidate[] = [];
    for (let i = 1; i < total - 1; i++) {
      let score = 0;
      const currentRank = points[i].rank;
      const prevRank = points[i - 1].rank;
      const nextRank = points[i + 1].rank;

      const isRiseOrDropLeft = currentRank !== prevRank;
      const isRiseOrDropRight = currentRank !== nextRank;

      if (isRiseOrDropLeft || isRiseOrDropRight) {
        score = 1;
        if ((currentRank > prevRank && currentRank > nextRank) || (currentRank < prevRank && currentRank < nextRank)) {
          score = 2;
        }
      } else {
        score = 0;
      }
      candidates.push({ index: i, score });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    });

    const selected: number[] = [0, total - 1];
    
    for (const cand of candidates) {
      let ok = true;
      for (const sel of selected) {
        if (Math.abs(cand.index - sel) < minStep) {
          ok = false;
          break;
        }
      }
      if (ok) {
        selected.push(cand.index);
        this.visibleLabelIndices.add(cand.index);
      }
    }

    selected.sort((a, b) => a - b);
    for (let i = 0; i < selected.length - 1; i++) {
      const left = selected[i];
      const right = selected[i + 1];
      let gap = right - left;
      
      while (gap >= 2 * minStep) {
        const mid = Math.round(left + gap / 2);
        let bestInsert = -1;
        
        for (let idx = mid - 1; idx <= mid + 1; idx++) {
          if (idx > left && idx < right) {
            let safe = true;
            for (const sel of selected) {
              if (Math.abs(idx - sel) < minStep) {
                safe = false;
                break;
              }
            }
            if (safe) {
              bestInsert = idx;
              break;
            }
          }
        }

        if (bestInsert !== -1) {
          selected.push(bestInsert);
          selected.sort((a, b) => a - b);
          this.visibleLabelIndices.add(bestInsert);
          gap = bestInsert - left;
        } else {
          break;
        }
      }
    }
  }

  getPopupSvgPath(): string {
    const points = this.trendPopupPoints;
    if (points.length < 2) return '';
    
    const width = 500;
    const height = 200;
    const padding = 30;
    const maxRank = this.trendPopupCategory === 'tracks' ? 100 :
                    this.trendPopupCategory === 'artists' ? 50 : 15;
    
    const pts = points.map((pt, idx) => {
      const x = padding + (idx / (points.length - 1)) * (width - 2 * padding);
      const y = padding + ((pt.rank - 1) / (maxRank - 1)) * (height - 2 * padding);
      return { x, y };
    });
    
    return `M ${pts.map(pt => `${pt.x},${pt.y}`).join(' L ')}`;
  }

  getPopupSvgFillPath(): string {
    const linePath = this.getPopupSvgPath();
    if (!linePath) return '';
    
    const width = 500;
    const height = 200;
    const padding = 30;
    
    const points = this.trendPopupPoints;
    const firstX = padding;
    const lastX = width - padding;
    const bottomY = height - padding;
    
    return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  }

  private readonly PLACEHOLDER_URL = 'https://misc.scdn.co/liked-songs/liked-songs-300.png';

  private isPlaceholderImage(url: string | null | undefined): boolean {
    return !url || url === this.PLACEHOLDER_URL;
  }

  /** Search historical snapshots for a real image for this track by id/name */
  private findHistoricalTrackCover(track: any): string {
    if (!this.historyData || this.historyData.length === 0) return '';
    for (let i = this.historyData.length - 1; i >= 0; i--) {
      const snap = this.historyData[i];
      const found = (snap.topTracks || []).find((t: any) =>
        this.statsItemsMatch(t, track, 'tracks')
      );
      if (found && !this.isPlaceholderImage(found.albumCover)) return found.albumCover;
    }
    return '';
  }

  /** Search historical snapshots for a real image for this artist by id/name */
  private findHistoricalArtistImage(artist: any): string {
    if (!this.historyData || this.historyData.length === 0) return '';
    for (let i = this.historyData.length - 1; i >= 0; i--) {
      const snap = this.historyData[i];
      const found = (snap.topArtists || []).find((a: any) =>
        (artist.id && a.id && a.id === artist.id) || (a.name === artist.name)
      );
      if (found && !this.isPlaceholderImage(found.imageUrl)) return found.imageUrl;
    }
    return '';
  }

  getTrackCover(track: any): string {
    const candidates = [
      track.albumCover,
      track.album?.images?.[0]?.url,
      track.album?.image_url,
      track.image_url
    ];
    for (const url of candidates) {
      if (!this.isPlaceholderImage(url)) return url;
    }
    // Fall back to a historically-known good image, or a generic music note SVG
    return this.findHistoricalTrackCover(track) || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555555"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
  }

  getTrackUrl(track: any): string {
    return track.spotifyUrl || track.external_urls?.spotify || '';
  }

  getTrackArtist(track: any): string {
    if (typeof track?.artist === 'string') return track.artist;
    if (typeof track?.artist?.name === 'string') return track.artist.name;
    if (typeof track?.artist_name === 'string') return track.artist_name;
    return track?.artists?.[0]?.name || '';
  }

  getArtistImage(artist: any): string {
    const candidates = [artist.imageUrl, artist.images?.[0]?.url];
    for (const url of candidates) {
      if (!this.isPlaceholderImage(url)) return url;
    }
    // Fall back to a historically-known good image, or a generic user profile silhouette SVG
    return this.findHistoricalArtistImage(artist) || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555555"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  }

  getArtistUrl(artist: any): string {
    return artist.spotifyUrl || artist.external_urls?.spotify || '';
  }

  isSnapshotLoading(): boolean {
    if (this.selectedSnapshotId === 'current') return false;
    const snap = this.historyData.find(d => d.timestamp.toString() === this.selectedSnapshotId);
    return snap ? snap.isLoaded === 'loading' : false;
  }

  ensureSnapshotLoaded(snapshotId: string | 'current') {
    if (!snapshotId || snapshotId === 'current') return;

    const snap = this.historyData.find(d => d.timestamp.toString() === snapshotId);
    if (!snap || snap.isLoaded) return;

    this.lazyLoadSnapshotDetails(snapshotId);
  }

  lazyLoadSnapshotDetails(snapshotIdStr: string) {
    const snap = this.historyData.find(d => d.timestamp.toString() === snapshotIdStr);
    if (!snap || snap.isLoaded === 'loading' || snap.isLoaded === true) return;

    const range = this.selectedRange;
    snap.isLoaded = 'loading';
    const supabaseUserId = this.authService.getSupabaseUserId();
    if (supabaseUserId && snap.id) {
      console.log(`[Stats] Lazy-loading snapshot details on demand: ${snap.snapshotDate || snapshotIdStr}`);
      this.supabaseService.loadStatsSnapshotById(supabaseUserId, snap.id).then(fullSnap => {
        if (range !== this.selectedRange) return;

        if (fullSnap) {
          const idx = this.historyData.findIndex(d => d.timestamp.toString() === snapshotIdStr);
          if (idx !== -1) {
            this.historyData[idx] = { ...this.historyData[idx], ...fullSnap, isLoaded: true };
            // Save to local IndexedDB for future offline usage
            const userId = this.authService.getUserId() || 'anonymous';
            this.storageService.saveStatsHistory({ ...this.historyData[idx], userId }).catch(() => {});
            this.calculateHotMovers();
          }
        } else {
          snap.isLoaded = false;
        }
      }).catch(err => {
        console.error('Failed to lazy load snapshot details:', err);
        snap.isLoaded = false;
      });
    } else {
      snap.isLoaded = true;
    }
  }

  trackStatItem(index: number, item: any): string | number {
    return item?.id || item?.uri || item?.spotifyId || item?.name || index;
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showHistoryMenu = false;
    this.showCompareMenu = false;
  }
}
