import { Injectable } from '@angular/core';
import { SpotifyDataService } from '../spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../auth/spotify-auth.service';
import { StorageService } from '../storage/storage.service';
import { SupabaseService } from '../supabase/supabase.service';

const PLACEHOLDER_URL = 'https://misc.scdn.co/liked-songs/liked-songs-300.png';

@Injectable({
  providedIn: 'root'
})
export class ImageHealingService {

  constructor(
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) {}

  private isPlaceholder(url: string | null | undefined): boolean {
    return !url || url === PLACEHOLDER_URL;
  }

  /**
   * Scans a list of artist objects and re-fetches any that are missing real
   * profile images from the Spotify API.  After healing, the changes are:
   *   1. Applied in-place on the array (component bindings update automatically).
   *   2. Written back to the given cacheKey in local storage (+ auto-synced to
   *      the user_cache Supabase table if backup is enabled).
   *   3. Written to the global `artists` Supabase table so every view that
   *      queries the DB (stats snapshots, artist-details, etc.) gets the fix.
   *
   * Artists whose id is falsy, or whose id is 'fav', are skipped.
   *
   * @param artists     Array of artist objects (mutated in place).
   * @param cacheKey    localStorage key to persist the patched array to (optional).
   */
  healArtistImages(artists: any[], cacheKey?: string): void {
    if (!artists || artists.length === 0) return;

    const missing = artists.filter(a => {
      if (!a.id || typeof a.id !== 'string' || a.id.trim() === '' || a.id === 'fav') return false;
      if (!a.images || a.images.length === 0) return true;
      const firstUrl = a.images[0]?.url;
      return this.isPlaceholder(firstUrl);
    });

    if (missing.length === 0) return;

    console.log(`[ImageHealingService] ${missing.length} artist(s) with missing images. Re-fetching…`);

    const missingIds = missing.map(a => a.id);
    for (let i = 0; i < missingIds.length; i += 50) {
      const batch = missingIds.slice(i, i + 50);
      this.spotifyDataService.getSeveralArtists(batch).subscribe({
        next: (res: any) => {
          const map = new Map<string, any>();
          (res.artists || []).forEach((a: any) => { if (a) map.set(a.id, a); });

          let changed = false;
          artists.forEach(artist => {
            if (!map.has(artist.id)) return;
            const full = map.get(artist.id);
            if (!full) return;

            const realImg = full.images?.[0]?.url;
            if (!this.isPlaceholder(realImg)) {
              artist.images = [{ url: realImg }];
              changed = true;
            }
            // Also heal genres while we're here
            if (full.genres?.length && (!artist.genres || artist.genres.length === 0)) {
              artist.genres = full.genres;
              changed = true;
            }
          });

          if (!changed) return;

          // 1. Persist to local cache + auto-sync to user_cache table
          if (cacheKey) {
            this.storageService.setItem(cacheKey, JSON.stringify(artists));
          }

          // 2. Push to the global `artists` DB table so historical snapshots
          //    and the artist-details page also get the real image
          const supabaseUserId = this.authService.getSupabaseUserId();
          if (this.authService.isBackupActive() && supabaseUserId) {
            const forSync = batch.map(id => map.get(id)).filter(a => !!a);
            if (forSync.length > 0) {
              this.supabaseService.syncArtists(forSync).catch(err =>
                console.warn('[ImageHealingService] syncArtists failed:', err)
              );
            }
          }

          console.log(`[ImageHealingService] Healed ${batch.length} artist(s); cache & DB updated.`);
        },
        error: (err: any) => console.warn('[ImageHealingService] Artist heal batch failed:', err)
      });
    }
  }

  /**
   * Scans a list of track objects and re-fetches any that are missing a real
   * album cover image from the Spotify API.  After healing:
   *   1. `track.albumCover` and `track.album.images[0].url` are patched.
   *   2. The patched array is persisted to cacheKey (optional).
   *   3. The album image is pushed to the global `albums` Supabase table via
   *      syncTracks so all historical views also get the fix.
   *
   * @param tracks    Array of track objects (mutated in place).
   * @param cacheKey  localStorage key to persist the patched array to (optional).
   */
  healTrackImages(tracks: any[], cacheKey?: string): void {
    if (!tracks || tracks.length === 0) return;

    const missing = tracks.filter(t => {
      if (!t.id) return false;
      const cover = t.albumCover || t.album?.images?.[0]?.url;
      return this.isPlaceholder(cover);
    });

    if (missing.length === 0) return;

    console.log(`[ImageHealingService] ${missing.length} track(s) with missing album covers. Re-fetching…`);

    const missingIds = missing.map(t => t.id);
    for (let i = 0; i < missingIds.length; i += 50) {
      const batch = missingIds.slice(i, i + 50);
      this.spotifyDataService.getSeveralTracks(batch).subscribe({
        next: (res: any) => {
          const map = new Map<string, any>();
          (res.tracks || []).forEach((t: any) => { if (t) map.set(t.id, t); });

          let changed = false;
          tracks.forEach(track => {
            if (!map.has(track.id)) return;
            const full = map.get(track.id);
            if (!full) return;

            const realImg = full.album?.images?.[0]?.url;
            if (!this.isPlaceholder(realImg)) {
              track.albumCover = realImg;
              if (!track.album) track.album = {};
              track.album.images = [{ url: realImg }];
              changed = true;
            }
          });

          if (!changed) return;

          // 1. Persist to local cache + auto-sync to user_cache table
          if (cacheKey) {
            this.storageService.setItem(cacheKey, JSON.stringify(tracks));
          }

          // 2. Push to the global `albums` DB table via syncTracks
          const supabaseUserId = this.authService.getSupabaseUserId();
          if (this.authService.isBackupActive() && supabaseUserId) {
            const forSync = batch.map(id => map.get(id)).filter(t => !!t);
            if (forSync.length > 0) {
              this.supabaseService.syncTracks(forSync).catch(err =>
                console.warn('[ImageHealingService] syncTracks failed:', err)
              );
            }
          }

          console.log(`[ImageHealingService] Healed ${batch.length} track(s); cache & DB updated.`);
        },
        error: (err: any) => console.warn('[ImageHealingService] Track heal batch failed:', err)
      });
    }
  }
}
