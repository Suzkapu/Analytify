import { Component, OnInit, HostListener } from '@angular/core';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { StorageService } from '../../services/storage/storage.service';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-user-stats',
  templateUrl: './user-stats.component.html',
  styleUrls: ['./user-stats.component.scss']
})
export class UserStatsComponent implements OnInit {
  selectedRange: string = 'short_term'; // 'short_term', 'medium_term', 'long_term'
  selectedCategory: string = 'tracks'; // 'tracks', 'artists', 'genres'
  isLoading: boolean = false;
  profilePicUrl: string | null = null;
  showSettingsDropdown: boolean = false;

  topTracks: any[] = [];
  topArtists: any[] = [];
  topGenres: { name: string; count: number; percentage: number; percentage_simple?: number }[] = [];
  
  // Stats History variables
  historyData: any[] = [];
  selectedHistoryPoint: any = null;
  selectedSnapshotId: string = 'current';
  snapshotOptions: any[] = [];
  showHistoryMenu: boolean = false;

  // Trend modal variables
  showTrendPopup: boolean = false;
  trendPopupItem: any = null;
  trendPopupCategory: 'tracks' | 'artists' = 'tracks';
  trendPopupPoints: any[] = [];

  constructor(
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private router: Router,
    private storageService: StorageService
  ) { }

  ngOnInit() {
    this.loadStats();
    this.loadUserProfile();
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

  changeRange(range: string) {
    this.selectedSnapshotId = 'current';
    this.selectedRange = range;
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

  loadStats() {
    const userId = this.authService.getUserId() || 'anonymous';
    const range = this.selectedRange;
    const lastUpdatedKey = `${userId}_stats_${range}_lastUpdated`;
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const isExpired = this.isCacheExpired(lastUpdated);

    const cachedTracks = this.storageService.getItem(`${userId}_stats_${range}_tracks`);
    const cachedArtists = this.storageService.getItem(`${userId}_stats_${range}_artists`);
    const cachedGenres = this.storageService.getItem(`${userId}_stats_${range}_genres`);

    if (cachedTracks && cachedArtists && cachedGenres && !isExpired) {
      console.log(`Loading stats for ${range} from cache`);
      this.topTracks = JSON.parse(cachedTracks);
      this.topArtists = JSON.parse(cachedArtists);
      this.calculateGenres();
      this.loadHistoryData();
      this.isLoading = false;
    } else {
      console.log(`Loading stats for ${range} from API`);
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

          this.saveHistorySnapshot(userId, range);
          this.isLoading = false;
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
          const current = genreCounts.get(genre) || 0;
          genreCounts.set(genre, current + rankWeight);
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  toggleSettingsDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = !this.showSettingsDropdown;
  }

  toggleHistoryMenu(event: Event) {
    event.stopPropagation();
    this.showHistoryMenu = !this.showHistoryMenu;
  }

  selectHistorySnapshot(snapshotId: string, event: Event) {
    event.stopPropagation();
    this.selectedSnapshotId = snapshotId;
    this.showHistoryMenu = false;
  }

  getSelectedSnapshotLabel(): string {
    if (this.selectedSnapshotId === 'current') {
      return 'Current Stats (Live)';
    }
    const found = this.snapshotOptions.find(opt => opt.id === this.selectedSnapshotId);
    return found ? found.label : 'Current Stats (Live)';
  }

  clearCacheAndLogout() {
    const userId = this.authService.getUserId() || 'anonymous';
    this.storageService.clearStatsHistory(userId).then(() => {
      this.authService.clearCacheAndLogout();
      this.router.navigate(['/login']);
    }).catch(err => {
      console.error('Failed to clear stats history:', err);
      this.authService.clearCacheAndLogout();
      this.router.navigate(['/login']);
    });
  }

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
        topGenres: this.topGenres.map(g => ({ name: g.name, percentage: g.percentage })),
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
    const range = this.selectedRange;
    this.storageService.getStatsHistory(userId, range).then(history => {
      this.historyData = history;
      // Populate snapshot options with clean date format (no timestamp)
      this.snapshotOptions = history.slice().reverse().map(d => ({
        id: d.timestamp.toString(),
        label: new Date(d.timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      }));
    }).catch(err => {
      console.error('Failed to load stats history:', err);
    });
  }

  getTrend(item: any, currentIdx: number, category: string): { type: 'up' | 'down' | 'same' | 'new', diff?: number } {
    if (!this.historyData || this.historyData.length < 2) {
      return { type: 'same' };
    }

    let prevSnapshot: any = null;
    if (this.selectedSnapshotId === 'current') {
      prevSnapshot = this.historyData[this.historyData.length - 2];
    } else {
      const currentSnapIdx = this.historyData.findIndex(d => d.timestamp.toString() === this.selectedSnapshotId);
      if (currentSnapIdx > 0) {
        prevSnapshot = this.historyData[currentSnapIdx - 1];
      }
    }

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
    return snap ? snap.topTracks : this.topTracks;
  }

  get displayedArtists(): any[] {
    if (this.selectedSnapshotId === 'current') {
      return this.topArtists;
    }
    const snap = this.historyData.find(d => d.timestamp.toString() === this.selectedSnapshotId);
    return snap ? snap.topArtists : this.topArtists;
  }

  onSnapshotChange(event: Event) {
    this.selectedSnapshotId = (event.target as HTMLSelectElement).value;
  }

  openTrendPopup(item: any, category: 'tracks' | 'artists') {
    this.trendPopupItem = item;
    this.trendPopupCategory = category;
    
    const name = item.name;
    const id = item.id;
    const points: any[] = [];
    
    this.historyData.forEach(snap => {
      const list = category === 'tracks' ? (snap.topTracks || []) : (snap.topArtists || []);
      const rankIdx = list.findIndex((x: any) => (x.id && id && x.id === id) || (x.name === name));
      if (rankIdx !== -1) {
        points.push({
          date: new Date(snap.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          rank: rankIdx + 1,
          timestamp: snap.timestamp
        });
      }
    });

    const currentList = category === 'tracks' ? this.topTracks : this.topArtists;
    const currentRankIdx = currentList.findIndex((x: any) => (x.id && id && x.id === id) || (x.name === name));
    if (currentRankIdx !== -1) {
      points.push({
        date: 'Now',
        rank: currentRankIdx + 1,
        timestamp: Date.now()
      });
    }

    this.trendPopupPoints = points;
    this.showTrendPopup = true;
  }

  closeTrendPopup(event?: Event) {
    if (event) event.stopPropagation();
    this.showTrendPopup = false;
    this.trendPopupItem = null;
    this.trendPopupPoints = [];
  }

  getPopupSvgPath(): string {
    const points = this.trendPopupPoints;
    if (points.length < 2) return '';
    
    const width = 500;
    const height = 200;
    const padding = 30;
    const maxRank = this.trendPopupCategory === 'tracks' ? 100 : 50;
    
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

  getTrackCover(track: any): string {
    if (track.albumCover) return track.albumCover;
    if (track.album?.images && track.album.images[0]) return track.album.images[0].url;
    return 'https://misc.scdn.co/liked-songs/liked-songs-300.png';
  }

  getTrackUrl(track: any): string {
    return track.spotifyUrl || track.external_urls?.spotify || '';
  }

  getTrackArtist(track: any): string {
    return track.artist || (track.artists && track.artists[0] ? track.artists[0].name : '');
  }

  getArtistImage(artist: any): string {
    if (artist.imageUrl) return artist.imageUrl;
    if (artist.images && artist.images[0]) return artist.images[0].url;
    return 'https://misc.scdn.co/liked-songs/liked-songs-300.png';
  }

  getArtistUrl(artist: any): string {
    return artist.spotifyUrl || artist.external_urls?.spotify || '';
  }

  getArtistGenre(artist: any): string {
    if (artist.genre) return artist.genre;
    return artist.genres && artist.genres[0] ? artist.genres[0] : 'Artist';
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
    this.showHistoryMenu = false;
  }
}
