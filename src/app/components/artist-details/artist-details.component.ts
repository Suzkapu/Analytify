import {Component, OnDestroy, OnInit} from '@angular/core';
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";
import {ActivatedRoute, Router} from "@angular/router";
import {SupabaseService} from "../../services/supabase/supabase.service";

@Component({
  selector: 'app-artist-details',
  templateUrl: './artist-details.component.html',
  styleUrls: ['./artist-details.component.scss'],
})
export class ArtistDetailsComponent implements OnInit, OnDestroy {
  artist: any = {};
  tracks: any[] = [];
  allTags: any;
  selectedTag: any;
  playlistId: string = '';


  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) {
    this.route.params.subscribe(async (params) => {
      this.tracks = history.state.tracks;
      this.playlistId = history.state.playlistId || '';
      await this.loadArtistDetails(params['id']);
    });
  }



  ngOnInit() {
  }

  ngOnDestroy() {
  }

  private isCacheExpired(lastUpdatedStr: string | null): boolean {
    if (!lastUpdatedStr) return true;
    const lastUpdated = Number(lastUpdatedStr);
    if (!Number.isFinite(lastUpdated)) return true;

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0);
    if (now.getTime() < cutoff.getTime()) {
      cutoff.setDate(cutoff.getDate() - 1);
    }
    return lastUpdated < cutoff.getTime();
  }

  async loadArtistDetails(id: string) {
    const userId = this.authService.getUserId() || 'anonymous';
    const artistCacheKey = `${userId}_artist_${id}`;
    const artistUpdatedKey = `${artistCacheKey}_lastUpdated`;

    const readArtistCache = (): any | null => {
      const cachedArtist = this.storageService.getItem(artistCacheKey);
      if (!cachedArtist || this.isCacheExpired(this.storageService.getItem(artistUpdatedKey))) {
        return null;
      }
      try {
        const parsed = JSON.parse(cachedArtist);
        return parsed?.id === id ? parsed : null;
      } catch {
        return null;
      }
    };

    let cachedArtist = readArtistCache();
    if (cachedArtist) {
      this.artist = cachedArtist;
      return;
    }

    if (this.playlistId) {
      const storageKey = `${userId}_${this.playlistId}`;
      const storedArtists = this.storageService.getItem(storageKey);
      if (storedArtists) {
        const parsed = JSON.parse(storedArtists);
        const found = parsed.find((a: any) => a.id === id);
        if (found) {
          console.log(this.authService.isBackupActive() ? "[ArtistDetails] Loading artist details from Supabase Cloud Backup (Local Cache)" : "[ArtistDetails] Loading artist details from Local Storage Cache (Cloud Backup disabled)");
          this.artist = found;
          return;
        }
      }
    }

    if (this.authService.isBackupActive()) {
      await this.storageService.restoreItemsFromCloud([artistCacheKey, artistUpdatedKey]);
      cachedArtist = readArtistCache();
      if (cachedArtist) {
        this.artist = cachedArtist;
        return;
      }
    }

    const dbArtist = await this.supabaseService.loadArtistById(id);
    if (dbArtist) {
      console.log('[ArtistDetails] Loading artist details from Supabase.');
      this.artist = dbArtist;
      this.storageService.setItem(artistCacheKey, JSON.stringify(dbArtist));
      this.storageService.setItem(artistUpdatedKey, Date.now().toString());
      return;
    }

    console.log("[ArtistDetails] Cache missing. Loading artist details from Spotify API...");
    this.spotifyDataService.getSingleArtist(id).subscribe({
      next: (artist: any) => {
        this.artist = artist;
        this.storageService.setItem(artistCacheKey, JSON.stringify(artist));
        this.storageService.setItem(artistUpdatedKey, Date.now().toString());
        if (this.authService.isBackupActive()) {
          this.supabaseService.syncArtists([artist]).catch(err => {
            console.warn('[ArtistDetails] Failed to persist artist metadata:', err);
          });
        }
      },
      error: (err) => console.error('[ArtistDetails] Failed to load artist from Spotify:', err)
    });
  }

  openTrackClick(url?: string) {
    if (url) {
      window.location.href = url;
    }
  }

  openArtistClick() {
    const url = this.getArtistSpotifyUrl();
    if (url) {
      window.location.href = url;
    }
  }

  getArtistSpotifyUrl(): string {
    if (this.artist?.external_urls?.spotify) {
      return this.artist.external_urls.spotify;
    }
    return this.artist?.id
      ? `https://open.spotify.com/artist/${encodeURIComponent(this.artist.id)}`
      : '';
  }

  goBack() {
    if (this.playlistId) {
      this.router.navigate(['/songs', this.playlistId]);
    } else {
      this.router.navigate(['/playlists']);
    }
  }


}
