import { Component, OnInit, HostListener } from '@angular/core';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { StorageService } from '../../services/storage/storage.service';
import { Router, ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SupabaseService } from '../../services/supabase/supabase.service';
import { ImageHealingService } from '../../services/image-healing/image-healing.service';

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${r}`;
}

@Component({
  selector: 'app-user-stats',
  templateUrl: './user-stats.component.html',
  styleUrls: ['./user-stats.component.scss']
})
export class UserStatsComponent implements OnInit {
  selectedRange: string = 'short_term'; // 'short_term', 'medium_term', 'long_term'
  selectedCategory: string = 'tracks'; // 'tracks', 'artists', 'genres'
  isLoading: boolean = false;


  topTracks: any[] = [];
  topArtists: any[] = [];
  topGenres: { name: string; count: number; percentage: number; percentage_simple?: number }[] = [];
  
  // Stats History variables
  historyData: any[] = [];
  selectedHistoryPoint: any = null;
  selectedSnapshotId: string = 'current';
  compareSnapshotId: string = '';
  snapshotOptions: any[] = [];
  historyGroups: any[] = [];
  compareGroups: any[] = [];
  showHistoryMenu: boolean = false;
  showCompareMenu: boolean = false;
  hotMoverTracks = new Set<string>();
  hotMoverArtists = new Set<string>();

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
    private router: Router,
    private storageService: StorageService,
    private supabaseService: SupabaseService,
    private imageHealingService: ImageHealingService
  ) { }

  async ngOnInit() {
    if (this.authService.isAuthenticated()) {
      await this.authService.ensureInitialSync();
    }
    this.loadStats();
  }



  changeRange(range: string) {
    this.selectedSnapshotId = 'current';
    this.selectedRange = range;
    this.compareSnapshotId = '';
    this.loadStats();
  }

  changeCategory(category: string) {
    this.selectedCategory = category;
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

  async loadStats() {
    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const range = this.selectedRange;
    const lastUpdatedKey = `${userId}_stats_${range}_lastUpdated`;
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const isExpired = this.isCacheExpired(lastUpdated);

    const cachedTracks = this.storageService.getItem(`${userId}_stats_${range}_tracks`);
    const cachedArtists = this.storageService.getItem(`${userId}_stats_${range}_artists`);
    const cachedGenres = this.storageService.getItem(`${userId}_stats_${range}_genres`);

    let isCacheIncomplete = false;
    let parsedTracks: any[] = [];
    let parsedArtists: any[] = [];
    let parsedGenres: any[] = [];

    if (cachedTracks && cachedArtists && cachedGenres) {
      try {
        parsedTracks = JSON.parse(cachedTracks);
        parsedArtists = JSON.parse(cachedArtists);
        parsedGenres = JSON.parse(cachedGenres);

        // Self-heal: If cache has German genres, discard it to fetch fresh English data!
        const hasGermanGenres = parsedGenres.some((g: any) => 
          g.name && (
            g.name.toLowerCase().startsWith('deutsch') || 
            g.name.toLowerCase().startsWith('argentinisch') ||
            g.name.toLowerCase().startsWith('schwedisch') ||
            g.name.toLowerCase().startsWith('finnisch') ||
            g.name.toLowerCase().startsWith('keltisch')
          )
        );
        if (hasGermanGenres) {
          console.log('[Stats] German genres detected in local cache. Invalidating cache to reload English data.');
          isCacheIncomplete = true;
        }

        if (!isCacheIncomplete && (!Array.isArray(parsedTracks) || !Array.isArray(parsedArtists) || !Array.isArray(parsedGenres))) {
          isCacheIncomplete = true;
        } else if (!isCacheIncomplete && parsedArtists.length > 0 && !parsedArtists.every(a => 'genres' in a)) {
          isCacheIncomplete = true;
          console.log('[Stats] Local cache is incomplete (artists missing genres). Forcing reload from cloud database or Spotify API.');
        }
      } catch (e) {
        isCacheIncomplete = true;
      }
    } else {
      isCacheIncomplete = true;
    }

    if (!isExpired && !isCacheIncomplete) {
      console.log(this.authService.isBackupActive() ? `[Stats] Loading stats for ${range} from Supabase Cloud Backup (Local Cache)` : `[Stats] Loading stats for ${range} from Local Storage Cache (Cloud Backup disabled)`);
      try {
        this.topTracks = parsedTracks;
        this.topArtists = parsedArtists;
        this.calculateGenres();
        this.saveHistorySnapshot(userId, range);
        this.isLoading = false;
        // Heal any missing images silently in the background
        this.imageHealingService.healArtistImages(this.topArtists, `${userId}_stats_${range}_artists`);
        this.imageHealingService.healTrackImages(this.topTracks, `${userId}_stats_${range}_tracks`);
      } catch (e) {
        console.warn('Failed to parse validated user stats cache:', e);
        isCacheIncomplete = true;
      }
    }
    
    if (isExpired || isCacheIncomplete) {
      // Prioritize Supabase data if backup is active
      if (this.authService.isBackupActive() && supabaseUserId) {
        this.isLoading = true;
        const hasSnapshot = await this.supabaseService.hasStatsSnapshotForToday(supabaseUserId, range);
        if (hasSnapshot) {
          console.log(`[Stats] Cache missing/expired. Fetching today's stats snapshot for ${range} directly from Supabase Cloud...`);
          const dbSnapshot = await this.supabaseService.loadTodayStatsSnapshot(supabaseUserId, range);
          if (dbSnapshot) {
            this.topTracks = dbSnapshot.topTracks;
            this.topArtists = dbSnapshot.topArtists;
            this.calculateGenres();
            
            // Cache locally
            this.storageService.setItem(`${userId}_stats_${range}_tracks`, JSON.stringify(this.topTracks));
            this.storageService.setItem(`${userId}_stats_${range}_artists`, JSON.stringify(this.topArtists));
            this.storageService.setItem(`${userId}_stats_${range}_genres`, JSON.stringify(this.topGenres));
            this.storageService.setItem(lastUpdatedKey, Date.now().toString());

            this.saveHistorySnapshot(userId, range);
            this.isLoading = false;
            // Heal any missing images that may be null in the DB
            this.imageHealingService.healArtistImages(this.topArtists, `${userId}_stats_${range}_artists`);
            this.imageHealingService.healTrackImages(this.topTracks, `${userId}_stats_${range}_tracks`);
            return; // Skip Spotify API call entirely!
          }
        }
      }

      console.log(`[Stats] Cache and database snapshot missing/expired. Loading stats for ${range} from Spotify API...`);
      this.isLoading = true;
      this.topTracks = [];
      this.topArtists = [];
      this.topGenres = [];

      const artistsReq = this.spotifyDataService.getUserTopArtists(range, 50, 0);
      const tracksReq = this.spotifyDataService.getUserTopTracks(range, 50, 0);
      const tracksReq2 = this.spotifyDataService.getUserTopTracks(range, 50, 50);

      forkJoin({
        artists: artistsReq,
        tracks: tracksReq,
        tracksPage2: tracksReq2
      }).subscribe({
        next: (res: any) => {
          this.topArtists = res.artists.items || [];

          const page1 = res.tracks.items || [];
          const page2 = res.tracksPage2.items || [];
          this.topTracks = [...page1, ...page2];

          this.calculateGenres();

          // Cache the results
          this.storageService.setItem(`${userId}_stats_${range}_tracks`, JSON.stringify(this.topTracks));
          this.storageService.setItem(`${userId}_stats_${range}_artists`, JSON.stringify(this.topArtists));
          this.storageService.setItem(`${userId}_stats_${range}_genres`, JSON.stringify(this.topGenres));
          this.storageService.setItem(lastUpdatedKey, Date.now().toString());

          // If backup is active, sync to Supabase
          if (this.authService.isBackupActive() && supabaseUserId) {
            let totalPopularity = 0;
            let explicitCount = 0;
            this.topTracks.forEach(track => {
              totalPopularity += track.popularity || 0;
              if (track.explicit) explicitCount++;
            });
            const avgPopularity = this.topTracks.length > 0 ? Math.round(totalPopularity / this.topTracks.length) : 0;
            const explicitPercentage = this.topTracks.length > 0 ? Math.round((explicitCount / this.topTracks.length) * 100) : 0;
            const genreDiversity = this.topGenres.length;

            this.supabaseService.saveStatsSnapshot(
              supabaseUserId,
              range,
              avgPopularity,
              explicitPercentage,
              genreDiversity,
              this.topTracks,
              this.topArtists,
              this.topGenres
            );
            this.storageService.setItem(`${supabaseUserId}_last_synced_at`, new Date().toISOString());

            const trackIds = this.topTracks.map(t => t.id).filter(id => !!id);
            if (trackIds.length > 0) {
              this.spotifyDataService.getSeveralAudioFeatures(trackIds).subscribe({
                next: (res: any) => {
                  if (res && res.audio_features) {
                    this.supabaseService.syncTrackAudioFeatures(res.audio_features);
                  }
                },
                error: (err) => console.warn('Failed to fetch audio features for top tracks:', err)
              });
            }
          }

          this.saveHistorySnapshot(userId, range);
          this.isLoading = false;
          // Heal any missing images — shouldn't happen with fresh API data
          // but guards against Spotify returning nulls
          this.imageHealingService.healArtistImages(this.topArtists, `${userId}_stats_${range}_artists`);
          this.imageHealingService.healTrackImages(this.topTracks, `${userId}_stats_${range}_tracks`);
        },
        error: (err) => {
          console.error('Failed to load user stats:', err);
          this.isLoading = false;
          // Fallback if API fails but we have stale cache
          if (cachedTracks && cachedArtists && cachedGenres) {
            this.topTracks = JSON.parse(cachedTracks);
            this.topArtists = JSON.parse(cachedArtists);
            this.topGenres = JSON.parse(cachedGenres);
          }
        }
      });
    }
  }

  calculateGenres() {
    const genreCounts = new Map<string, number>();

    // Weight genres by artist rank (artist index 0 gets 50, index 49 gets 1)
    this.topArtists.forEach((artist, index) => {
      const rankWeight = 50 - index;
      if (artist.genres) {
        artist.genres.forEach((genre: string) => {
          if (genre && genre.trim().toLowerCase() !== 'artist') {
            const current = genreCounts.get(genre) || 0;
            genreCounts.set(genre, current + rankWeight);
          }
        });
      }
    });

    const sortedGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    const totalGenresWeight = sortedGenres.reduce((sum, entry) => sum + entry[1], 0);
    const maxWeight = sortedGenres.length > 0 ? sortedGenres[0][1] : 1;

    this.topGenres = sortedGenres.map(([name, weight]) => {
      const percentage = totalGenresWeight > 0 ? Math.min(100, Math.round((weight / totalGenresWeight) * 100)) : 0;
      const percentage_simple = weight > 0 ? Math.max(2, Math.min(100, Math.round((weight / maxWeight) * 100))) : 0;
      return { name, count: Math.round(weight), percentage, percentage_simple };

    }).slice(0, 15); // Top 15 genres
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
    
    const userId = this.authService.getUserId() || 'anonymous';
    const rangeLabel = this.selectedRange === 'short_term' ? 'Last 4 Weeks' : 
                       this.selectedRange === 'medium_term' ? 'Last 6 Months' : 'Last Year';
    const playlistName = `Top Tracks - ${rangeLabel}`;
    const description = `My top tracks on Spotify for ${rangeLabel}, generated by Analytify.`;

    this.spotifyDataService.createPlaylist(userId, playlistName, description).subscribe({
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
    this.showHistoryMenu = !this.showHistoryMenu;
  }

  selectHistorySnapshot(snapshotId: string, event: Event) {
    event.stopPropagation();
    this.selectedSnapshotId = snapshotId;
    // Pick best compare directly, skipping '' to avoid flicker
    const bestCompare = this.snapshotOptions.find(opt => opt.id !== snapshotId);
    this.compareSnapshotId = bestCompare ? bestCompare.id : (snapshotId !== 'current' ? 'current' : '');
    this.showHistoryMenu = false;
    this.calculateHotMovers();
    this.ensureSnapshotLoaded(snapshotId);
    if (this.compareSnapshotId) this.ensureSnapshotLoaded(this.compareSnapshotId);
    this.updateSnapshotGroups();
  }

  toggleCompareMenu(event: Event) {
    event.stopPropagation();
    this.showHistoryMenu = false;
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
    this.historyGroups = this.groupSnapshots(this.snapshotOptions, this.selectedSnapshotId);
    this.compareGroups = this.groupSnapshots(this.getCompareOptions(), this.compareSnapshotId);
  }

  groupSnapshots(options: any[], selectedId: string): any[] {
    const groupsMap = new Map<string, any>();
    
    options.forEach(opt => {
      const date = new Date(parseInt(opt.id, 10));
      if (isNaN(date.getTime())) return;
      const year = date.getFullYear();
      const monthLabel = date.toLocaleDateString(undefined, { month: 'long' });
      const groupKey = `${monthLabel} ${year}`;
      
      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          label: groupKey,
          isOpen: false,
          options: []
        });
      }
      
      const group = groupsMap.get(groupKey);
      group.options.push(opt);
      
      if (opt.id === selectedId) {
        group.isOpen = true;
      }
    });

    const groups = Array.from(groupsMap.values());
    if (groups.length > 0 && !groups.some(g => g.isOpen)) {
      groups[0].isOpen = true;
    }
    
    return groups;
  }

  toggleHistoryGroup(group: any, event: Event) {
    event.stopPropagation();
    group.isOpen = !group.isOpen;
  }

  toggleCompareGroup(group: any, event: Event) {
    event.stopPropagation();
    group.isOpen = !group.isOpen;
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

  getCompareOptions(): any[] {
    // Historical snapshots excluding the currently selected one, newest first
    const historicalOptions = this.snapshotOptions.filter(opt => opt.id !== this.selectedSnapshotId);

    const options: any[] = historicalOptions.map(opt => ({
      id: opt.id,
      label: opt.label
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
          name: t.name,
          artist: this.getTrackArtist(t),
          albumCover: this.getTrackCover(t),
          explicit: t.explicit || false,
          popularity: t.popularity || 0,
          spotifyUrl: this.getTrackUrl(t)
        })),
        topArtists: this.topArtists.map(a => ({
          id: a.id,
          name: a.name,
          imageUrl: this.getArtistImage(a),
          spotifyUrl: this.getArtistUrl(a),
          genre: this.getArtistGenre(a)
        })),
        topGenres: this.topGenres.map(g => ({ name: g.name, percentage: g.percentage, count: g.count }))
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

    const tracks = this.displayedTracks;
    const artists = this.displayedArtists;

    if (!this.historyData || this.historyData.length === 0) {
      return;
    }

    // Calculate trends for all tracks
    const trackMovers = tracks.map((track, idx) => {
      const trend = this.getTrend(track, idx, 'tracks');
      return { track, trend };
    })
    .filter(item => item.trend.type === 'up' && item.trend.diff !== undefined && item.trend.diff >= 15) // spike of 15+ places
    .sort((a, b) => (b.trend.diff || 0) - (a.trend.diff || 0))
    .slice(0, 3);

    trackMovers.forEach(item => {
      const key = item.track.id || `${item.track.name}_${this.getTrackArtist(item.track)}`;
      this.hotMoverTracks.add(key);
    });

    // Calculate trends for all artists
    const artistMovers = artists.map((artist, idx) => {
      const trend = this.getTrend(artist, idx, 'artists');
      return { artist, trend };
    })
    .filter(item => item.trend.type === 'up' && item.trend.diff !== undefined && item.trend.diff >= 15) // spike of 15+ places
    .sort((a, b) => (b.trend.diff || 0) - (a.trend.diff || 0))
    .slice(0, 3);

    artistMovers.forEach(item => {
      const key = item.artist.id || item.artist.name;
      this.hotMoverArtists.add(key);
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

    // Calculate current metrics
    let totalPopularity = 0;
    let explicitCount = 0;
    this.topTracks.forEach(track => {
      totalPopularity += track.popularity || 0;
      if (track.explicit) explicitCount++;
    });
    const avgPopularity = this.topTracks.length > 0 ? Math.round(totalPopularity / this.topTracks.length) : 0;
    const explicitPercentage = this.topTracks.length > 0 ? Math.round((explicitCount / this.topTracks.length) * 100) : 0;
    const genreDiversity = this.topGenres.length;

    this.writeRealSnapshot(userId, range, avgPopularity, explicitPercentage, genreDiversity);
  }

  private writeRealSnapshot(userId: string, range: string, avgPopularity: number, explicitPercentage: number, genreDiversity: number) {
    this.storageService.getStatsHistory(userId, range).then(history => {
      const lastEntry = history.length > 0 ? history[history.length - 1] : null;
      
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(1, 0, 0, 0); // 1:00 AM today
      if (now.getTime() < cutoff.getTime()) {
        cutoff.setDate(cutoff.getDate() - 1);
      }

      // Only save one snapshot per day (since the last 1 AM cutoff)
      if (lastEntry && lastEntry.timestamp >= cutoff.getTime()) {
        console.log('Skipping history snapshot - already saved today');
        this.loadHistoryData();
        return;
      }

      const snapshot = {
        userId: userId,
        range: range,
        timestamp: Date.now(),
        avgPopularity: avgPopularity,
        explicitPercentage: explicitPercentage,
        genreDiversity: genreDiversity,
        topGenres: this.topGenres.map(g => ({ name: g.name, percentage: g.percentage, count: g.count })),
        topTracks: this.topTracks.map(t => ({
          id: t.id,
          name: t.name,
          artist: t.artists && t.artists[0] ? t.artists[0].name : '',
          albumCover: t.album?.images && t.album.images[0] ? t.album.images[0].url : '',
          explicit: t.explicit || false,
          popularity: t.popularity || 0,
          spotifyUrl: t.external_urls?.spotify || ''
        })),
        topArtists: this.topArtists.map(a => ({
          id: a.id,
          name: a.name,
          imageUrl: a.images && a.images[0] ? a.images[0].url : '',
          spotifyUrl: a.external_urls?.spotify || '',
          genre: a.genres && a.genres[0] ? a.genres[0] : 'Artist'
        }))
      };

      this.storageService.saveStatsHistory(snapshot).then(() => {
        console.log('Saved history snapshot to IndexedDB');
        this.loadHistoryData();
      });
    });
  }

  loadHistoryData() {
    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const range = this.selectedRange;

    const loadLocal = () => {
      return this.storageService.getStatsHistory(userId, range).then(history => {
        // Mark snapshots that already have topTracks array as fully loaded
        this.historyData = (history || []).map(h => ({
          ...h,
          isLoaded: (h.topTracks && h.topTracks.length > 0) ? true : (h.isLoaded || false)
        }));
        
        // Define today's 1:00 AM cutoff to identify today's snapshots
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setHours(1, 0, 0, 0); // 1:00 AM today
        if (now.getTime() < cutoff.getTime()) {
          cutoff.setDate(cutoff.getDate() - 1);
        }

        // Only include historical entries before today's 1 AM cutoff
        const historicalOnly = this.historyData.filter(d => d.timestamp < cutoff.getTime());

        // Populate snapshot options with clean date format (no timestamp)
        this.snapshotOptions = historicalOnly.slice().reverse().map(d => ({
          id: d.timestamp.toString(),
          label: new Date(d.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
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
      // 2. Perform sync in background
      const ready = this.authService.initialSyncPromise || Promise.resolve();
      ready.then(() => {
        const isBackupActive = this.authService.isBackupActive();
        if (isBackupActive && supabaseUserId) {
          // Fetch only the lightweight metadata from Supabase
          this.supabaseService.loadAllStatsSnapshotsMetadata(supabaseUserId, range).then(async (dbSnapshots) => {
            const localHistory = await this.storageService.getStatsHistory(userId, range).catch(() => [] as any[]);

            const toDateKey = toLocalDateKey;

            const cloudDateKeys = new Set((dbSnapshots || []).map((s: any) =>
              s.snapshotDate || toDateKey(s.timestamp)
            ));

            let localUpdated = false;

            // Step 1: Download cloud snapshots missing from local IndexedDB (as metadata-only placeholder)
            if (dbSnapshots && dbSnapshots.length > 0) {
              try {
                const localDateKeys = new Set(localHistory.map((h: any) => toDateKey(h.timestamp)));
                for (const snap of dbSnapshots) {
                  const key = snap.snapshotDate || toDateKey(snap.timestamp);
                  if (!localDateKeys.has(key)) {
                    await this.storageService.saveStatsHistory({ ...snap, userId, isLoaded: false });
                    localDateKeys.add(key);
                    localUpdated = true;
                  }
                }
              } catch (e) {
                console.warn('[Stats] Failed to restore DB history snapshots locally:', e);
              }
            }

            // Step 2: Upload local-only snapshots to cloud
            try {
              const localOnlySnapshots = localHistory.filter((h: any) =>
                !cloudDateKeys.has(toDateKey(h.timestamp))
              );

              for (const localSnap of localOnlySnapshots) {
                const dateStr = toDateKey(localSnap.timestamp);
                let totalPop = 0; let explicitCount = 0;
                (localSnap.topTracks || []).forEach((t: any) => {
                  totalPop += t.popularity || 0;
                  if (t.explicit) explicitCount++;
                });
                const trackCount = (localSnap.topTracks || []).length;
                const avgPop = trackCount > 0 ? Math.round(totalPop / trackCount) : 0;
                const explPct = trackCount > 0 ? Math.round((explicitCount / trackCount) * 100) : 0;
                const genreDiversity = (localSnap.topGenres || []).length;

                console.log(`[Stats] Uploading local-only snapshot to cloud: ${dateStr} (${range})`);
                await this.supabaseService.saveStatsSnapshot(
                  supabaseUserId,
                  range,
                  avgPop,
                  explPct,
                  genreDiversity,
                  localSnap.topTracks || [],
                  localSnap.topArtists || [],
                  localSnap.topGenres || [],
                  true,    // onlyInsertMissing — don't overwrite existing metadata objects
                  dateStr  // customDateStr — use the real historical date, not today
                );
              }
            } catch (e) {
              console.warn('[Stats] Failed to upload local-only snapshots to cloud:', e);
            }

            if (localUpdated) {
              await loadLocal();
            }

            // Background load of all detailed snapshots to populate local database fully
            const hasUnloaded = this.historyData.some(d => d.isLoaded !== true);
            if (hasUnloaded) {
              console.log('[Stats] Background loading all detailed snapshots from cloud...');
              this.supabaseService.loadAllStatsSnapshots(supabaseUserId, range).then(async (fullSnapshots) => {
                let anyUpdated = false;
                for (const fullSnap of fullSnapshots) {
                  const idx = this.historyData.findIndex(d => 
                    (d.snapshotDate || toDateKey(d.timestamp)) === (fullSnap.snapshotDate || toDateKey(fullSnap.timestamp))
                  );
                  if (idx !== -1 && this.historyData[idx].isLoaded !== true) {
                    this.historyData[idx] = { ...this.historyData[idx], ...fullSnap, isLoaded: true };
                    await this.storageService.saveStatsHistory({ ...this.historyData[idx], userId }).catch(() => {});
                    anyUpdated = true;
                  }
                }
                if (anyUpdated) {
                  console.log('[Stats] Background loaded detailed snapshots successfully.');
                  this.calculateHotMovers();
                }
              }).catch(err => {
                console.warn('[Stats] Failed to background load detailed snapshots:', err);
              });
            }
          }).catch(err => {
            console.warn('[Stats] Failed to load history snapshots from Supabase:', err);
          });
        }
      });
    });
  }


  getTrend(item: any, currentIdx: number, category: string): { type: 'up' | 'down' | 'same' | 'new', diff?: number } {
    if (!this.historyData || this.historyData.length === 0) {
      return { type: 'same' };
    }

    const prevSnapshot = this.getComparisonSnapshot();

    if (!prevSnapshot) {
      return { type: 'same' };
    }

    if (category === 'tracks') {
      const prevTracks = prevSnapshot.topTracks || [];
      const prevIdx = prevTracks.findIndex((t: any) => (t.id && item.id && t.id === item.id) || (t.name === item.name && t.artist === this.getTrackArtist(item)));
      if (prevIdx === -1) {
        return { type: 'new' };
      }
      if (prevIdx > currentIdx) {
        return { type: 'up', diff: prevIdx - currentIdx };
      }
      if (prevIdx < currentIdx) {
        return { type: 'down', diff: currentIdx - prevIdx };
      }
      return { type: 'same' };
    }

    if (category === 'artists') {
      const prevArtists = prevSnapshot.topArtists || [];
      const prevIdx = prevArtists.findIndex((a: any) => (a.id && item.id && a.id === item.id) || (a.name === item.name));
      if (prevIdx === -1) {
        return { type: 'new' };
      }
      if (prevIdx > currentIdx) {
        return { type: 'up', diff: prevIdx - currentIdx };
      }
      if (prevIdx < currentIdx) {
        return { type: 'down', diff: currentIdx - prevIdx };
      }
      return { type: 'same' };
    }

    if (category === 'genres') {
      const prevGenres = prevSnapshot.topGenres || [];
      const prevIdx = prevGenres.findIndex((g: any) => {
        const name = typeof g === 'string' ? g : g.name;
        return name === item.name;
      });
      if (prevIdx === -1) {
        return { type: 'new' };
      }
      if (prevIdx > currentIdx) {
        return { type: 'up', diff: prevIdx - currentIdx };
      }
      if (prevIdx < currentIdx) {
        return { type: 'down', diff: currentIdx - prevIdx };
      }
      return { type: 'same' };
    }

    return { type: 'same' };
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

  get displayedGenres(): any[] {
    let rawGenres: any[] = [];
    if (this.selectedSnapshotId === 'current') {
      rawGenres = this.topGenres;
    } else {
      const snap = this.historyData.find(d => d.timestamp.toString() === this.selectedSnapshotId);
      if (snap) {
        if (snap.isLoaded === false) {
          this.lazyLoadSnapshotDetails(snap.timestamp.toString());
        }
        rawGenres = snap.isLoaded === true && snap.topGenres ? snap.topGenres : [];
      }
    }

    if (rawGenres.length === 0) return [];

    const maxPercentage = rawGenres.length > 0 ? (rawGenres[0].percentage || 1) : 1;
    const prevSnapshot = this.getComparisonSnapshot();
    const prevGenres = prevSnapshot ? (prevSnapshot.topGenres || []) : [];



    return rawGenres.map((g: any, idx: number) => {
      const currentRank = idx + 1;
      const currentPercentage = g.percentage;

      const prevIdx = prevGenres.findIndex((pg: any) => {
        const pgName = typeof pg === 'string' ? pg : pg.name;
        return pgName === g.name;
      });

      let trendType: 'up' | 'down' | 'same' | 'new' = 'same';
      let rankDiff = 0;
      let percentageDiff = 0;
      let prevPercentage = 0;

      if (prevIdx === -1) {
        trendType = prevSnapshot ? 'new' : 'same';
        percentageDiff = currentPercentage;
      } else {
        const prevGenre = prevGenres[prevIdx];
        prevPercentage = typeof prevGenre === 'string' ? 0 : (prevGenre.percentage || 0);
        percentageDiff = currentPercentage - prevPercentage;

        const prevRank = prevIdx + 1;
        if (prevRank > currentRank) {
          trendType = 'up';
          rankDiff = prevRank - currentRank;
        } else if (prevRank < currentRank) {
          trendType = 'down';
          rankDiff = currentRank - prevRank;
        } else {
          trendType = 'same';
        }
      }

      return {
        name: g.name,
        percentage: currentPercentage,
        percentage_simple: currentPercentage > 0 ? Math.max(2, Math.min(100, Math.round((currentPercentage / (maxPercentage || 1)) * 100))) : 0,
        prevPercentageSimple: prevPercentage > 0 ? Math.max(2, Math.min(100, Math.round((prevPercentage / (maxPercentage || 1)) * 100))) : 0,
        rank: currentRank,
        trendType,
        rankDiff,
        percentageDiff,
        prevPercentage,
        hasCompare: !!prevSnapshot
      };
    });
  }

  onSnapshotChange(event: Event) {
    this.selectedSnapshotId = (event.target as HTMLSelectElement).value;
  }

  async openTrendPopup(item: any, category: 'tracks' | 'artists' | 'genres') {
    this.trendPopupItem = item;
    this.trendPopupCategory = category;
    this.showTrendPopup = true;
    this.trendPopupPoints = [];

    const hasUnloaded = this.historyData.some(d => d.isLoaded !== true);
    const supabaseUserId = this.authService.getSupabaseUserId();

    if (hasUnloaded && this.authService.isBackupActive() && supabaseUserId) {
      this.isLoadingTrendData = true;
      try {
        const userId = this.authService.getUserId() || 'anonymous';
        const range = this.selectedRange;
        console.log(`[Stats] Trend popup clicked, but some snapshots are not loaded. Fetching all snapshot details from cloud...`);
        const fullSnapshots = await this.supabaseService.loadAllStatsSnapshots(supabaseUserId, range);
        
        const toDateKey = toLocalDateKey;
        // Update historyData in-place and save to IndexedDB
        for (const fullSnap of fullSnapshots) {
          const idx = this.historyData.findIndex(d => 
            (d.snapshotDate || toDateKey(d.timestamp)) === (fullSnap.snapshotDate || toDateKey(fullSnap.timestamp))
          );
          if (idx !== -1) {
            this.historyData[idx] = { ...this.historyData[idx], ...fullSnap, isLoaded: true };
            await this.storageService.saveStatsHistory({ ...this.historyData[idx], userId }).catch(() => {});
          }
        }
        this.calculateHotMovers();
      } catch (err) {
        console.error('Failed to load all stats snapshots for trend popup:', err);
      } finally {
        this.isLoadingTrendData = false;
      }
    }

    this.calculateTrendPoints();
  }

  calculateTrendPoints() {
    if (!this.trendPopupItem) return;
    const item = this.trendPopupItem;
    const category = this.trendPopupCategory;
    const name = item.name;
    const id = item.id;
    const points: any[] = [];
    
    this.historyData.forEach(snap => {
      const list = category === 'tracks' ? (snap.topTracks || []) :
                   category === 'artists' ? (snap.topArtists || []) :
                   (snap.topGenres || []);
      const rankIdx = list.findIndex((x: any) => {
        if (category === 'tracks') {
          return (x.id && id && x.id === id) || (x.name === name && x.artist === this.getTrackArtist(item));
        } else if (category === 'artists') {
          return (x.id && id && x.id === id) || (x.name === name);
        } else {
          return (typeof x === 'string' ? x : x.name) === name;
        }
      });
      if (rankIdx !== -1) {
        points.push({
          date: new Date(snap.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          rank: rankIdx + 1,
          timestamp: snap.timestamp
        });
      }
    });

    const currentList = category === 'tracks' ? this.topTracks :
                        category === 'artists' ? this.topArtists :
                        this.topGenres;
    const currentRankIdx = currentList.findIndex((x: any) => {
      if (category === 'tracks') {
        return (x.id && id && x.id === id) || (x.name === name && this.getTrackArtist(x) === this.getTrackArtist(item));
      } else if (category === 'artists') {
        return (x.id && id && x.id === id) || (x.name === name);
      } else {
        return x.name === name;
      }
    });

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
      points.push({
        date: 'Now',
        rank: currentRankIdx + 1,
        timestamp: Date.now()
      });
    }

    this.trendPopupPoints = points;
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
        (track.id && t.id && t.id === track.id) ||
        (t.name === track.name && t.artist === this.getTrackArtist(track))
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
    return track.artist || (track.artists && track.artists[0] ? track.artists[0].name : '');
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

  getArtistGenre(artist: any): string {
    if (artist.genre) return artist.genre;
    return artist.genres && artist.genres[0] ? artist.genres[0] : 'Artist';
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

    snap.isLoaded = 'loading';
    const supabaseUserId = this.authService.getSupabaseUserId();
    if (supabaseUserId && snap.id) {
      console.log(`[Stats] Lazy-loading snapshot details on demand: ${snap.snapshotDate || snapshotIdStr}`);
      this.supabaseService.loadStatsSnapshotById(supabaseUserId, snap.id).then(fullSnap => {
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

  @HostListener('document:click')
  onDocumentClick() {
    this.showHistoryMenu = false;
    this.showCompareMenu = false;
  }
}
