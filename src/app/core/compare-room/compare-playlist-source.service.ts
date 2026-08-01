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
    await this.storage.initFromDB();
    const storageKey = `${spotifyUserId}_playlists`;
    let raw = this.storage.getItem(storageKey);

    const localPlaylists = this.parsePlaylists(raw);
    if (localPlaylists) return localPlaylists;

    // Only wait for cloud hydration when IndexedDB did not contain a usable
    // playlist list. This preserves the source priority local -> cloud -> API.
    await this.auth.ensureInitialSync();
    raw = this.storage.getItem(storageKey);
    const hydratedPlaylists = this.parsePlaylists(raw);
    if (hydratedPlaylists) return hydratedPlaylists;

    if (this.auth.isBackupActive()) {
      await this.storage.restoreItemsFromCloud([storageKey, `${storageKey}_lastUpdated`]);
      raw = this.storage.getItem(storageKey);
    }
    const cloudPlaylists = this.parsePlaylists(raw);
    if (cloudPlaylists) return cloudPlaylists;

    return this.spotify.getPlaylists(accessToken, this.stripDevSuffix(spotifyUserId));
  }

  async loadMainTracks(
    playlist: ComparePlaylist,
    accessToken: string,
    spotifyUserId: string
  ): Promise<{tracks: CompareTrack[]; source: 'local' | 'cloud' | 'spotify'}> {
    await this.storage.initFromDB();
    const storageKey = `${spotifyUserId}_${playlist.id}`;
    let raw = this.storage.getItem(storageKey);
    const localTracks = this.parseTracks(raw, playlist);
    if (localTracks) return {tracks: localTracks, source: 'local'};

    // Initial sync may hydrate this exact cache entry from Supabase. It is
    // deliberately deferred until the local IndexedDB value proves unusable.
    await this.auth.ensureInitialSync();
    raw = this.storage.getItem(storageKey);
    const hydratedTracks = this.parseTracks(raw, playlist);
    if (hydratedTracks) return {tracks: hydratedTracks, source: 'cloud'};

    if (this.auth.isBackupActive()) {
      const restored = await this.storage.restoreItemsFromCloud([
        storageKey,
        `${storageKey}_Amount`,
        `${storageKey}_Name`,
        `${storageKey}_CachedTrackCount`,
        `${storageKey}_lastUpdated`
      ]);
      raw = this.storage.getItem(storageKey);
      const cloudTracks = this.parseTracks(raw, playlist);
      if (restored > 0 && cloudTracks) return {tracks: cloudTracks, source: 'cloud'};
    }

    return {tracks: await this.spotify.getPlaylistTracks(playlist, accessToken), source: 'spotify'};
  }

  private parsePlaylists(raw: string | null): ComparePlaylist[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const playlists = this.spotify.normalizeCachedPlaylists(parsed);
      return playlists.length > 0 ? playlists : null;
    } catch {
      return null;
    }
  }

  private parseTracks(raw: string | null, playlist: ComparePlaylist): CompareTrack[] | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const tracks = this.spotify.normalizeCachedTracks(parsed);
      return tracks.length > 0 || playlist.total === 0 ? tracks : null;
    } catch {
      return null;
    }
  }

  private stripDevSuffix(userId: string): string {
    return userId.endsWith('_dev') ? userId.slice(0, -4) : userId;
  }
}
