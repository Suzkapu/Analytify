import { Component, OnInit, ViewEncapsulation, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from "@angular/router";
import { SpotifyDataService } from "../../services/spotify-data/spotify-data.service";
import { SpotifyAuthService } from "../../services/auth/spotify-auth.service";
import { StorageService } from "../../services/storage/storage.service";
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-playlist-analysis',
  templateUrl: './playlist-analysis.component.html',
  styleUrls: ['./playlist-analysis.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class PlaylistAnalysisComponent implements OnInit {
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
  profilePicUrl: string | null = null;
  showSettingsDropdown: boolean = false;



  constructor(
    private route: ActivatedRoute,
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private router: Router,
    private storageService: StorageService
  ) { }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.playlistId = params['id'];
      this.loadPlaylistData();
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

  loadPlaylistData() {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${this.playlistId}`;
    const storedArtists = this.storageService.getItem(storageKey);
    const lastUpdatedKey = `${storageKey}_lastUpdated`;
    const lastUpdated = this.storageService.getItem(lastUpdatedKey);

    const isExpired = this.isCacheExpired(lastUpdated);

    if (storedArtists && !isExpired) {
      console.log("Loading cache for analysis");
      const parsedArtists = JSON.parse(storedArtists);

      this.artists = parsedArtists;
      this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
      this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
      this.runAnalysis();

      // Self-healing check: if cache lacks images or genres, upgrade cache
      const isOldCache = parsedArtists.length > 0 && (!parsedArtists[0].images || !parsedArtists[0].genres);
      if (isOldCache) {
        console.log("Old cache detected on analysis. Reloading.");
        this.triggerApiLoad(true);
      }
    } else {
      if (storedArtists) {
        this.artists = JSON.parse(storedArtists);
        this.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.runAnalysis();
      }
      // If we have cached data but it's expired, we do background refresh to maintain smooth UX
      this.triggerApiLoad(!!storedArtists);
    }
  }

  triggerApiLoad(isBackgroundRefresh: boolean) {
    console.log("Fetching API for analysis recursively");
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
    } else {
      this.isRefreshing = false;
      this.isLoading = true;
      this.artists = [];
      targetArray = this.artists;
    }

    this.isLoadingTracks = true;
    this.isLoadingArtists = true;
    this.loadedTracksCount = 0;

    const storedArtists = this.storageService.getItem(`${userId}_${this.playlistId}`);
    if (this.playlistId === 'fav' && storedArtists) {
      console.log("Favourite Tracks detected for analysis. Starting incremental load.");
      this.loadNewerFavTracks(0, 50, JSON.parse(storedArtists), targetArray);
    } else {
      if (this.playlistId === 'fav') {
        this.playlistName = 'Favourite Tracks';
        this.spotifyDataService.getFavTracks(0, 50).subscribe({
          next: (tracks: any) => {
            this.totalTracks = tracks.total;
            this.getArtistsFromTracks(tracks.items, targetArray);
            this.loadedTracksCount = Math.min(50, this.totalTracks);

            this.isLoading = false;
            this.runAnalysis();

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

            this.isLoading = false;
            this.runAnalysis();

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

          this.runAnalysis();
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

          this.runAnalysis();
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
        this.runAnalysis();
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
        console.error('Incremental loading failed for analysis:', err);
        if (targetArray === this.artists) {
          this.artists = cachedArtists;
        }
        this.isLoading = false;
        this.isLoadingTracks = false;
        this.isLoadingArtists = false;
        this.runAnalysis();
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

        this.runAnalysis();

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
      this.runAnalysis();
    }
  }

  setSessionStorage() {
    this.artists.sort((a, b) => b.tracks.length - a.tracks.length);

    // Explicitly map only the required fields to drastically reduce the storage payload size
    const cleanedArtists = this.artists.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      images: artist.images ? artist.images.map((img: any) => ({ url: img.url })) : [],
      genres: artist.genres || [],
      tracks: artist.tracks ? artist.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        popularity: track.popularity,
        explicit: track.explicit,
        duration_ms: track.duration_ms,
        external_urls: track.external_urls ? { spotify: track.external_urls.spotify } : undefined,
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
  }

  getArtistsFromTracks(items: any[], targetArray: any[] = this.artists) {
    try {
      for (let item of items) {
        if (!item || !item.track) continue;
        let track = item.track;
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  showClearCacheModal = false;

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
  }

  openTrackClick(url: string) {
    if (url) {
      window.location.href = url;
    }
  }

  }
