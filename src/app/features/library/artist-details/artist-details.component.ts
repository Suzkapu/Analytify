import {Component, OnDestroy} from '@angular/core';
import {SpotifyDataService} from "@core/data-access/spotify/spotify-data.service";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {ActivatedRoute, Router} from "@angular/router";
import {SupabaseService} from "@core/data-access/supabase/supabase.service";
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {openSpotifyUrl} from '@core/navigation/spotify-url';
import {distinctUntilChanged, firstValueFrom, map, Subscription} from 'rxjs';

const console = createScopedLogger('Artist Details');

@Component({
    selector: 'app-artist-details',
    templateUrl: './artist-details.component.html',
    styleUrls: ['./artist-details.component.scss'],
    standalone: false
})
export class ArtistDetailsComponent implements OnDestroy {
  artist: any = {};
  tracks: any[] = [];
  playlistId: string = '';
  isLoadingArtist = true;
  artistLoadError = '';
  private artistId = '';
  private loadGeneration = 0;
  private routeSubscription: Subscription;


  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) {
    this.routeSubscription = this.route.params.pipe(
      map(params => params['id'] || ''),
      distinctUntilChanged()
    ).subscribe(id => {
      const generation = ++this.loadGeneration;
      this.artistId = id;
      this.artist = {};
      this.tracks = Array.isArray(history.state?.tracks) ? history.state.tracks : [];
      this.playlistId = history.state?.playlistId || '';
      this.isLoadingArtist = true;
      this.artistLoadError = '';
      void this.loadArtistDetails(id, generation);
    });
  }

  ngOnDestroy(): void {
    this.loadGeneration++;
    this.routeSubscription.unsubscribe();
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

  async loadArtistDetails(id: string, generation = this.loadGeneration) {
    const canApply = () => this.artistId === id && this.loadGeneration === generation;
    if (!canApply()) return;
    this.isLoadingArtist = true;
    this.artistLoadError = '';
    const userId = this.authService.getUserId() || 'anonymous';
    const artistCacheKey = `${userId}_artist_${id}`;
    const artistUpdatedKey = `${artistCacheKey}_lastUpdated`;
    if (this.storageService.hydrateItems) {
      await this.storageService.hydrateItems([
        artistCacheKey,
        ...(this.playlistId ? [`${userId}_${this.playlistId}`] : [])
      ]);
    }
    if (!canApply()) return;

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
      this.finishArtistLoading(cachedArtist, id, generation);
      return;
    }

    if (this.playlistId) {
      const storageKey = `${userId}_${this.playlistId}`;
      const storedArtists = this.storageService.getItem(storageKey);
      if (storedArtists) {
        try {
          const parsed = JSON.parse(storedArtists);
          const found = Array.isArray(parsed)
            ? parsed.find((a: any) => a.id === id)
            : null;
          if (found) {
            console.log('[ArtistDetails] Loading artist details from the local IndexedDB playlist cache.');
            this.finishArtistLoading(found, id, generation);
            return;
          }
        } catch (error) {
          console.warn('[ArtistDetails] Ignoring an invalid playlist cache entry:', error);
        }
      }
    }

    if (this.authService.isBackupActive()) {
      await this.storageService.restoreItemsFromCloud(
        [artistCacheKey, artistUpdatedKey],
        canApply
      );
      if (!canApply()) return;
      cachedArtist = readArtistCache();
      if (cachedArtist) {
        this.finishArtistLoading(cachedArtist, id, generation);
        return;
      }
    }

    const dbArtist = await this.supabaseService.loadArtistById(id);
    if (!canApply()) return;
    if (dbArtist) {
      console.log('[ArtistDetails] Loading artist details from Supabase.');
      this.finishArtistLoading(dbArtist, id, generation);
      this.storageService.setItem(artistCacheKey, JSON.stringify(dbArtist));
      this.storageService.setItem(artistUpdatedKey, Date.now().toString());
      return;
    }

    console.log("[ArtistDetails] Cache missing. Loading artist details from Spotify API...");
    try {
      const artist = await firstValueFrom(this.spotifyDataService.getSingleArtist(id));
      if (!canApply()) return;
      this.finishArtistLoading(artist, id, generation);
        this.storageService.setItem(artistCacheKey, JSON.stringify(artist));
        this.storageService.setItem(artistUpdatedKey, Date.now().toString());
        if (this.authService.isBackupActive()) {
          this.supabaseService.syncArtists([artist]).catch(err => {
            console.warn('[ArtistDetails] Failed to persist artist metadata:', err);
          });
        }
    } catch (err) {
      if (canApply()) {
        console.error('[ArtistDetails] Failed to load artist from Spotify:', err);
        this.isLoadingArtist = false;
        this.artistLoadError = 'Artist details could not be loaded.';
      }
    }
  }

  private finishArtistLoading(artist: any, id: string, generation: number): void {
    if (this.artistId !== id || this.loadGeneration !== generation) return;
    this.artist = artist;
    this.isLoadingArtist = false;
  }

  openTrackClick(url?: string) {
    openSpotifyUrl(url, {expectedType: 'track', target: '_self'});
  }

  openArtistClick() {
    const url = this.getArtistSpotifyUrl();
    openSpotifyUrl(url, {expectedType: 'artist', target: '_self'});
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
