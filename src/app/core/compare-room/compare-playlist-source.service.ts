import {Injectable} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {ComparePlaylist, CompareTrack} from './compare-room.models';
import {ParticipantSpotifyService} from './participant-spotify.service';

@Injectable({providedIn: 'root'})
export class ComparePlaylistSourceService {
  constructor(
    private storage: StorageService,
    private auth: SpotifyAuthService,
    private spotify: ParticipantSpotifyService
  ) {}

  async loadMainPlaylists(accessToken: string, spotifyUserId: string): Promise<ComparePlaylist[]> {
    await this.auth.ensureInitialSync();
    const storageKey = `${spotifyUserId}_playlists`;
    let raw = this.storage.getItem(storageKey);
    if (!raw && this.auth.isBackupActive()) {
      await this.storage.restoreItemsFromCloud([storageKey, `${storageKey}_lastUpdated`]);
      raw = this.storage.getItem(storageKey);
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.spotify.normalizeCachedPlaylists(parsed);
        }
      } catch {
        // The API fallback below repairs the user experience without mutating cache.
      }
    }
    return this.spotify.getPlaylists(accessToken, this.stripDevSuffix(spotifyUserId));
  }

  async loadMainTracks(
    playlist: ComparePlaylist,
    accessToken: string,
    spotifyUserId: string
  ): Promise<{tracks: CompareTrack[]; source: 'local' | 'cloud' | 'spotify'}> {
    const storageKey = `${spotifyUserId}_${playlist.id}`;
    let raw = this.storage.getItem(storageKey);
    let source: 'local' | 'cloud' = 'local';
    if (!raw && this.auth.isBackupActive()) {
      const restored = await this.storage.restoreItemsFromCloud([
        storageKey,
        `${storageKey}_Amount`,
        `${storageKey}_Name`,
        `${storageKey}_CachedTrackCount`,
        `${storageKey}_lastUpdated`
      ]);
      raw = this.storage.getItem(storageKey);
      if (restored > 0) source = 'cloud';
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const tracks = this.spotify.normalizeCachedTracks(parsed);
          if (tracks.length > 0 || playlist.total === 0) return {tracks, source};
        }
      } catch {
        // Continue to the Spotify fallback.
      }
    }
    return {tracks: await this.spotify.getPlaylistTracks(playlist, accessToken), source: 'spotify'};
  }

  private stripDevSuffix(userId: string): string {
    return userId.endsWith('_dev') ? userId.slice(0, -4) : userId;
  }
}
