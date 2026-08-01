import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';

const PLACEHOLDER_URL = 'https://misc.scdn.co/liked-songs/liked-songs-300.png';

@Injectable({
  providedIn: 'root'
})
export class ImageHealingService {
  private artistHealingInFlight = new Set<string>();
  private artistHealingAttempted = new Set<string>();
  private failedArtistImageUrls = new Map<string, Set<string>>();

  constructor(
    private spotifyDataService: SpotifyDataService,
    private authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) {}

  private isPlaceholder(url: string | null | undefined): boolean {
    return !url || url === PLACEHOLDER_URL;
  }

  markArtistImageFailed(artistId: string, imageUrl: string | null | undefined): void {
    if (!artistId || !imageUrl || imageUrl === PLACEHOLDER_URL) return;
    const failedUrls = this.failedArtistImageUrls.get(artistId) || new Set<string>();
    failedUrls.add(imageUrl);
    this.failedArtistImageUrls.set(artistId, failedUrls);
    this.artistHealingAttempted.delete(artistId);
  }

  private isKnownFailedArtistImage(
    artistId: string,
    imageUrl: string | null | undefined
  ): boolean {
    return !!imageUrl && !!this.failedArtistImageUrls.get(artistId)?.has(imageUrl);
  }

  /**
   * Repairs missing artist images in source order: normalized Supabase
   * metadata first, then Spotify for profiles that are still incomplete.
   * Each artist is attempted at most once per app session.
   */
  healArtistImages(artists: any[], cacheKey?: string): void {
    if (!Array.isArray(artists) || artists.length === 0) return;

    const missingIds = Array.from(new Set<string>(
      artists
        .filter(artist => {
          if (
            !artist?.id ||
            typeof artist.id !== 'string' ||
            artist.id.trim() === '' ||
            artist.id === 'fav'
          ) {
            return false;
          }
          if (
            this.artistHealingInFlight.has(artist.id) ||
            this.artistHealingAttempted.has(artist.id)
          ) {
            return false;
          }
          return this.isPlaceholder(artist.images?.[0]?.url);
        })
        .map(artist => artist.id)
    ));

    if (missingIds.length === 0) return;

    missingIds.forEach(id => {
      this.artistHealingInFlight.add(id);
      this.artistHealingAttempted.add(id);
    });

    void this.healArtistImagesFromSources(artists, missingIds, cacheKey)
      .catch(error => {
        console.warn('[ImageHealingService] Artist image recovery failed:', error);
      })
      .finally(() => {
        missingIds.forEach(id => this.artistHealingInFlight.delete(id));
      });
  }

  private async healArtistImagesFromSources(
    artists: any[],
    missingIds: string[],
    cacheKey?: string
  ): Promise<void> {
    console.log(
      `[ImageHealingService] Recovering ${missingIds.length} missing artist image(s) from Supabase, then Spotify.`
    );

    const applyProfiles = (profiles: any[]): boolean => {
      const profileMap = new Map<string, any>();
      profiles.forEach(profile => {
        if (profile?.id) profileMap.set(profile.id, profile);
      });

      let changed = false;
      artists.forEach(artist => {
        const profile = profileMap.get(artist.id);
        const imageUrl = profile?.images?.[0]?.url;
        if (
          !profile ||
          this.isPlaceholder(imageUrl) ||
          this.isKnownFailedArtistImage(artist.id, imageUrl)
        ) {
          return;
        }

        artist.images = [{ url: imageUrl }];
        if (profile.external_urls?.spotify) {
          artist.external_urls = { spotify: profile.external_urls.spotify };
        }
        changed = true;
      });
      return changed;
    };

    const databaseArtists = await this.supabaseService.loadArtistsByIds(missingIds);
    let changed = applyProfiles(databaseArtists);
    if (changed && cacheKey) {
      this.storageService.setItem(cacheKey, JSON.stringify(artists));
    }

    const unresolvedIds = missingIds.filter(id => {
      const artist = artists.find(candidate => candidate.id === id);
      return this.isPlaceholder(artist?.images?.[0]?.url);
    });

    const spotifyArtists: any[] = [];
    for (let offset = 0; offset < unresolvedIds.length; offset += 50) {
      const batch = unresolvedIds.slice(offset, offset + 50);
      const response = await firstValueFrom(
        this.spotifyDataService.getArtistsByIds(batch)
      );
      const profiles = response?.artists || [];
      spotifyArtists.push(...profiles);
      changed = applyProfiles(profiles) || changed;
    }

    if (changed && cacheKey) {
      this.storageService.setItem(cacheKey, JSON.stringify(artists));
    }

    const supabaseUserId = this.authService.getSupabaseUserId();
    if (
      spotifyArtists.length > 0 &&
      this.authService.isBackupActive() &&
      supabaseUserId
    ) {
      await this.supabaseService.syncArtists(spotifyArtists);
    }
  }

  /**
   * Repairs missing album covers from Spotify and persists the recovered
   * metadata locally and, when enabled, in Supabase.
   */
  healTrackImages(tracks: any[], cacheKey?: string): void {
    if (!Array.isArray(tracks) || tracks.length === 0) return;

    const missing = tracks.filter(track => {
      if (!track?.id) return false;
      const cover = track.albumCover || track.album?.images?.[0]?.url;
      return this.isPlaceholder(cover);
    });

    if (missing.length === 0) return;

    console.log(
      `[ImageHealingService] ${missing.length} track(s) with missing album covers. Re-fetching.`
    );

    const missingIds = missing.map(track => track.id);
    for (let offset = 0; offset < missingIds.length; offset += 50) {
      const batch = missingIds.slice(offset, offset + 50);
      this.spotifyDataService.getTracksByIds(batch).subscribe({
        next: (response: any) => {
          const trackMap = new Map<string, any>();
          (response.tracks || []).forEach((track: any) => {
            if (track) trackMap.set(track.id, track);
          });

          let changed = false;
          tracks.forEach(track => {
            const fullTrack = trackMap.get(track.id);
            const imageUrl = fullTrack?.album?.images?.[0]?.url;
            if (!fullTrack || this.isPlaceholder(imageUrl)) return;

            track.albumCover = imageUrl;
            if (!track.album) track.album = {};
            track.album.images = [{ url: imageUrl }];
            changed = true;
          });

          if (!changed) return;

          if (cacheKey) {
            this.storageService.setItem(cacheKey, JSON.stringify(tracks));
          }

          const supabaseUserId = this.authService.getSupabaseUserId();
          if (this.authService.isBackupActive() && supabaseUserId) {
            const tracksForSync = batch
              .map(id => trackMap.get(id))
              .filter(track => !!track);
            if (tracksForSync.length > 0) {
              this.supabaseService.syncTracks(tracksForSync).catch(error => {
                console.warn('[ImageHealingService] syncTracks failed:', error);
              });
            }
          }
        },
        error: (error: any) => {
          console.warn('[ImageHealingService] Track image recovery failed:', error);
        }
      });
    }
  }
}
