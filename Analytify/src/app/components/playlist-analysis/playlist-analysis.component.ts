import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {forkJoin} from 'rxjs';

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
  loadedTracksCount: number = 0;
  totalTracks: number = 0;
  cooldownMessage: string = '';

  // Analysis results
  uniqueTracksCount: number = 0;
  totalDurationFormatted: string = '';
  averageDurationFormatted: string = '';
  averagePopularity: number = 0;
  explicitCount: number = 0;
  explicitPercentage: number = 0;
  
  topGenres: { name: string; count: number; percentage: number }[] = [];
  longestTrack: any = null;
  shortestTrack: any = null;
  oldestTrack: any = null;
  newestTrack: any = null;
  profilePicUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.playlistId = params['id'];
      this.loadPlaylistData();
      this.loadUserProfile();
    });
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

  loadPlaylistData(forceRefresh = false) {
    const userId = this.authService.getUserId() || 'anonymous';
    const storageKey = `${userId}_${this.playlistId}`;
    const storedArtists = localStorage.getItem(storageKey);
    const cookieKey = `cooldown_${userId}_${this.playlistId}`;

    if (storedArtists && !forceRefresh) {
      console.log("Loading cache for analysis");
      const parsedArtists = JSON.parse(storedArtists);
      
      // Self-healing check: if cache lacks images or genres, upgrade cache
      const isOldCache = parsedArtists.length > 0 && (!parsedArtists[0].images || !parsedArtists[0].genres);
      if (isOldCache) {
        console.log("Old cache detected on analysis. Reloading.");
        this.loadPlaylistData(true);
      } else {
        this.artists = parsedArtists;
        this.totalTracks = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
        this.playlistName = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Name`) || '""');
        this.runAnalysis();
      }
    } else {
      // Check cooldown cookie if we are force-refreshing and have cache
      if (storedArtists && forceRefresh) {
        const expiresAtStr = this.getCookie(cookieKey);
        if (expiresAtStr) {
          const expiresAt = parseInt(expiresAtStr, 10);
          const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
          if (remaining > 0) {
            this.cooldownMessage = `Refreshing is on cooldown. Please wait ${remaining} seconds.`;
            setTimeout(() => this.cooldownMessage = '', 4000);

            // Cooldown protection fallback: load existing cached data instead of showing an empty view
            this.artists = JSON.parse(storedArtists);
            this.totalTracks = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Amount`) || '0');
            this.playlistName = JSON.parse(localStorage.getItem(`${userId}_${this.playlistId}_Name`) || '""');
            this.runAnalysis();
            this.isLoading = false;
            return;
          }
        }
      }

      console.log("Fetching API for analysis recursively");
      this.isLoading = true;
      this.loadedTracksCount = 0;

      // Set cooldown cookie (e.g. 180 seconds = 3 minutes)
      const cooldownSecs = 180;
      this.setCookie(cookieKey, (Date.now() + cooldownSecs * 1000).toString(), cooldownSecs);

      // If we have cached data and this is fav, perform incremental load of new liked songs
      if (this.playlistId === 'fav' && storedArtists) {
        console.log("Favourite Tracks detected for analysis. Starting incremental load.");
        this.artists = [];
        this.loadNewerFavTracks(0, 50, JSON.parse(storedArtists));
      } else {
        this.artists = [];
        if (this.playlistId === 'fav') {
          this.playlistName = 'Favourite Tracks';
          this.spotifyDataService.getFavTracks(0, 50).subscribe({
            next: (tracks: any) => {
              this.totalTracks = tracks.total;
              this.getArtistsFromTracks(tracks.items);
              this.loadedTracksCount = Math.min(50, this.totalTracks);

              if (this.loadedTracksCount < this.totalTracks) {
                this.loadRemainingTracks(50, 50, this.totalTracks);
              } else {
                this.fetchArtistDetailsAndSave();
              }
            },
            error: (err) => {
              console.error('Failed to load first page of favourite tracks:', err);
              this.isLoading = false;
            }
          });
        } else {
          this.spotifyDataService.getSinglePlaylist(this.playlistId).subscribe({
            next: (playlist: any) => {
              this.playlistName = playlist.name;
              this.totalTracks = playlist.tracks.total;
              this.getArtistsFromTracks(playlist.tracks.items);
              this.loadedTracksCount = Math.min(100, this.totalTracks);

              if (this.loadedTracksCount < this.totalTracks) {
                this.loadRemainingTracks(100, 100, this.totalTracks);
              } else {
                this.fetchArtistDetailsAndSave();
              }
            },
            error: (err) => {
              console.error('Failed to load first page of playlist:', err);
              this.isLoading = false;
            }
          });
        }
      }
    }
  }

  loadRemainingTracks(offset: number, limit: number, total: number) {
    if (this.playlistId === 'fav') {
      this.spotifyDataService.getFavTracks(offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(tracks.items);
          this.loadedTracksCount = Math.min(offset + limit, total);
          if (this.loadedTracksCount < total) {
            this.loadRemainingTracks(offset + limit, limit, total);
          } else {
            this.fetchArtistDetailsAndSave();
          }
        },
        error: (err) => {
          console.error('Error loading remaining fav tracks:', err);
          this.fetchArtistDetailsAndSave();
        }
      });
    } else {
      this.spotifyDataService.getAllTracksFromPlaylist(this.playlistId, offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(tracks.items);
          this.loadedTracksCount = Math.min(offset + limit, total);
          if (this.loadedTracksCount < total) {
            this.loadRemainingTracks(offset + limit, limit, total);
          } else {
            this.fetchArtistDetailsAndSave();
          }
        },
        error: (err) => {
          console.error('Error loading remaining playlist tracks:', err);
          this.fetchArtistDetailsAndSave();
        }
      });
    }
  }

  loadNewerFavTracks(offset: number, limit: number, cachedArtists: any[]) {
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
        
        this.getArtistsFromTracks(newItems);
        this.loadedTracksCount += newItems.length;

        if (!foundExisting && offset + limit < this.totalTracks) {
          this.loadNewerFavTracks(offset + limit, limit, cachedArtists);
        } else {
          this.mergeCachedArtists(cachedArtists);
          this.fetchArtistDetailsAndSave();
        }
      },
      error: (err) => {
        console.error('Incremental loading failed for analysis:', err);
        this.artists = cachedArtists;
        this.isLoading = false;
        this.runAnalysis();
      }
    });
  }

  mergeCachedArtists(cachedArtists: any[]) {
    cachedArtists.forEach(cachedArtist => {
      let existingArtist = this.artists.find(a => a.id === cachedArtist.id);
      if (!existingArtist) {
        this.artists.push(cachedArtist);
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

  fetchArtistDetailsAndSave() {
    const artistIds = this.artists.map(a => a.id);
    const batches: string[][] = [];
    
    for (let i = 0; i < artistIds.length; i += 50) {
      batches.push(artistIds.slice(i, i + 50));
    }

    if (batches.length === 0) {
      this.isLoading = false;
      this.setSessionStorage();
      this.runAnalysis();
      return;
    }

    const requests = batches.map(batch => this.spotifyDataService.getSeveralArtists(batch));
    forkJoin(requests).subscribe({
      next: (results: any[]) => {
        const allFullArtists = results.reduce((acc, current) => {
          return acc.concat(current.artists || []);
        }, []);

        const artistMap = new Map<string, any>();
        allFullArtists.forEach((a: any) => {
          if (a) artistMap.set(a.id, a);
        });

        this.artists.forEach(artist => {
          const full = artistMap.get(artist.id);
          if (full) {
            artist.images = full.images;
            artist.genres = full.genres;
          }
        });

        this.isLoading = false;
        this.setSessionStorage();
        this.runAnalysis();
      },
      error: (err) => {
        console.error('Error batch fetching artist details:', err);
        this.isLoading = false;
        this.setSessionStorage();
        this.runAnalysis();
      }
    });
  }

  setSessionStorage() {
    // Keep consistent caching structure
    this.artists.sort((a, b) => b.tracks.length - a.tracks.length);
    
    const cleanedArtists = JSON.parse(JSON.stringify(this.artists));
    cleanedArtists.forEach((artist: any) => {
      artist.tracks.forEach((track: any) => {
        delete track.artists;
        delete track.album.album_type;
        delete track.album.artists;
        delete track.album.external_urls;
        delete track.album.href;
        delete track.album.is_playable;
        delete track.album.name;
        delete track.album.release_date_precision;
        delete track.album.total_tracks;
        delete track.album.type;
        delete track.album.uri;
        delete track.available_markets;
        delete track.disc_number;
        delete track.external_ids;
        delete track.href;
        delete track.is_local;
        delete track.preview_url;
        delete track.track_number;
        delete track.type;
        delete track.uri;
        delete track.episode;
        delete track.is_playable;
        delete track.track;
      });
      delete artist.type;
    });

    const userId = this.authService.getUserId() || 'anonymous';
    localStorage.setItem(`${userId}_${this.playlistId}`, JSON.stringify(cleanedArtists));
    localStorage.setItem(`${userId}_${this.playlistId}_Amount`, JSON.stringify(this.totalTracks));
    localStorage.setItem(`${userId}_${this.playlistId}_Name`, JSON.stringify(this.playlistName));
  }

  getArtistsFromTracks(items: any[]) {
    try {
      for (let item of items) {
        if (!item || !item.track) continue;
        let track = item.track;
        for (let artist of track.artists) {
          let existingArtist = this.artists.find(a => a.id === artist.id);
          if (!existingArtist) {
            artist.tracks = [track];
            this.artists.push(artist);
          } else {
            let existingTrack = existingArtist.tracks.find((t: { id: any }) => t.id === track.id);
            if (!existingTrack) {
              existingArtist.tracks.push(track);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting artists from tracks:', error);
    }
  }

  runAnalysis() {
    // Extract unique tracks
    const tracksMap = new Map<string, any>();
    this.artists.forEach(artist => {
      artist.tracks.forEach((track: any) => {
        if (track && track.id) {
          // Restore artist name on the track dynamically if not present
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

    // 1. Total & Avg Duration
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
    this.explicitPercentage = Math.round((explicitCount / uniqueTracks.length) * 1000) / 10; // 1 decimal place

    // 2. Shortest & Longest Track
    const sortedByDuration = [...uniqueTracks].sort((a, b) => (a.duration_ms || 0) - (b.duration_ms || 0));
    this.shortestTrack = sortedByDuration[0];
    this.longestTrack = sortedByDuration[sortedByDuration.length - 1];

    // 3. Oldest & Newest Track
    const tracksWithDates = uniqueTracks.filter(t => t.album && t.album.release_date);
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

    // 4. Genre analysis
    // Aggregate genres based on track occurrences (weighted by song count for each artist)
    const genreCounts = new Map<string, number>();
    this.artists.forEach(artist => {
      const artistSongCount = artist.tracks.length;
      if (artist.genres && artist.genres.length) {
        artist.genres.forEach((genre: string) => {
          const count = genreCounts.get(genre) || 0;
          genreCounts.set(genre, count + artistSongCount);
        });
      }
    });

    // Sum total occurrences to calculate proportion
    this.topGenres = Array.from(genreCounts.entries())
      .map(([name, count]) => {
        const percentage = uniqueTracks.length > 0 ? Math.min(100, Math.round((count / uniqueTracks.length) * 100)) : 0;
        return { name, count, percentage };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // Format ms to 'X hr Y min' or 'Y min Z sec'
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

  // Format ms to 'M:SS'
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

  refreshCache() {
    this.loadPlaylistData(true);
  }

  openTrackClick(url: string) {
    if (url) {
      window.location.href = url;
    }
  }

  getCookie(name: string): string | null {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  setCookie(name: string, value: string, maxAgeSeconds: number) {
    document.cookie = `${name}=${value}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax; Secure`;
  }
}
