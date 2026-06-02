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
    this.selectedRange = range;
    this.loadStats();
  }

  changeCategory(category: string) {
    this.selectedCategory = category;
  }

  loadStats() {
    const userId = this.authService.getUserId() || 'anonymous';
    const range = this.selectedRange;
    const lastUpdatedKey = `${userId}_stats_${range}_lastUpdated`;
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const oneDay = 24 * 60 * 60 * 1000;
    const isExpired = !lastUpdated || (Date.now() - parseInt(lastUpdated, 10) > oneDay);

    const cachedTracks = this.storageService.getItem(`${userId}_stats_${range}_tracks`);
    const cachedArtists = this.storageService.getItem(`${userId}_stats_${range}_artists`);
    const cachedGenres = this.storageService.getItem(`${userId}_stats_${range}_genres`);

    if (cachedTracks && cachedArtists && cachedGenres && !isExpired) {
      console.log(`Loading stats for ${range} from cache`);
      this.topTracks = JSON.parse(cachedTracks);
      this.topArtists = JSON.parse(cachedArtists);
      this.calculateGenres();
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

  clearCacheAndLogout() {
    this.authService.clearCacheAndLogout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
  }
}
