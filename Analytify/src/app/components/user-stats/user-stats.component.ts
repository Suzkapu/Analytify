import { Component, OnInit } from '@angular/core';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-user-stats',
  templateUrl: './user-stats.component.html',
  styleUrls: ['./user-stats.component.scss']
})
export class UserStatsComponent implements OnInit {
  selectedRange: string = 'short_term'; // 'short_term', 'medium_term', 'long_term'
  selectedCategory: string = 'tracks'; // 'tracks', 'artists', 'genres', 'top100'
  isLoading: boolean = false;
  profilePicUrl: string | null = null;

  topTracks: any[] = [];
  topArtists: any[] = [];
  topGenres: { name: string; count: number; percentage: number }[] = [];
  top100Tracks: any[] = [];

  constructor(
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadUserProfile();
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

  changeRange(range: string) {
    this.selectedRange = range;
    this.loadStats();
  }

  changeCategory(category: string) {
    this.selectedCategory = category;
  }

  loadStats() {
    this.isLoading = true;
    this.topTracks = [];
    this.topArtists = [];
    this.topGenres = [];
    this.top100Tracks = [];

    // Parallel fetch top artists (50) and top tracks (offset 0, limit 50; offset 50, limit 50)
    const artistsReq = this.spotifyDataService.getUserTopArtists(this.selectedRange, 50, 0);
    const tracksReq = this.spotifyDataService.getUserTopTracks(this.selectedRange, 50, 0);
    const tracksReq2 = this.spotifyDataService.getUserTopTracks(this.selectedRange, 50, 50);

    forkJoin({
      artists: artistsReq,
      tracks: tracksReq,
      tracksPage2: tracksReq2
    }).subscribe({
      next: (res: any) => {
        this.topArtists = res.artists.items || [];
        this.topTracks = res.tracks.items || [];

        // Compile Top 100
        const page1 = res.tracks.items || [];
        const page2 = res.tracksPage2.items || [];
        this.top100Tracks = [...page1, ...page2];

        // Calculate Genres from top artists
        this.calculateGenres();

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load user stats:', err);
        this.isLoading = false;
      }
    });
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

    const maxWeight = sortedGenres.length > 0 ? sortedGenres[0][1] : 1;

    this.topGenres = sortedGenres.map(([name, weight]) => {
      const percentage = Math.min(100, Math.round((weight / maxWeight) * 100));
      return { name, count: weight, percentage };
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
}
