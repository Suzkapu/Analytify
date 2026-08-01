import {Injectable} from '@angular/core';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {ComparePlaylist, CompareTrack} from './compare-room.models';
import {ParticipantSpotifyService} from './participant-spotify.service';

type GuestDataSource = 'local' | 'cloud' | 'spotify';

interface GuestCacheContext {
  spotifyUserId: string;
  supabaseUserId: string | null;
  cloudBackupActive: boolean;
}

interface CacheCandidate<T> {
  value: T;
  source: Exclude<GuestDataSource, 'spotify'>;
  fresh: boolean;
  complete: boolean;
}

@Injectable({providedIn: 'root'})
export class CompareGuestPlaylistSourceService {
  private contextProfileId = '';
  private contextPromise: Promise<GuestCacheContext | null> | null = null;

  constructor(
    private storage: StorageService,
    private supabase: SupabaseService,
    private spotify: ParticipantSpotifyService
  ) {}

  async loadPlaylists(
    accessToken: string,
    spotifyProfileId: string
  ): Promise<{playlists: ComparePlaylist[]; source: GuestDataSource}> {
    const context = await this.resolveContext(spotifyProfileId);
    if (!context) {
      return {playlists: await this.spotify.getPlaylists(accessToken, spotifyProfileId), source: 'spotify'};
    }

    const storageKey = `${context.spotifyUserId}_playlists`;
    const timestampKey = `${storageKey}_lastUpdated`;
    const local = this.playlistCandidate(
      this.storage.getItem(storageKey),
      this.storage.getItem(timestampKey),
      'local'
    );
    if (local?.fresh) return {playlists: local.value, source: local.source};

    const cloud = await this.loadCloudCandidate(context, [storageKey, timestampKey], entries =>
      this.playlistCandidate(entries.get(storageKey) || null, entries.get(timestampKey) || null, 'cloud')
    );
    if (cloud?.fresh) return {playlists: cloud.value, source: cloud.source};

    try {
      return {playlists: await this.spotify.getPlaylists(accessToken, spotifyProfileId), source: 'spotify'};
    } catch (error) {
      const fallback = cloud || local;
      if (fallback) return {playlists: fallback.value, source: fallback.source};
      throw error;
    }
  }

  async loadTracks(
    playlist: ComparePlaylist,
    accessToken: string,
    spotifyProfileId: string
  ): Promise<{tracks: CompareTrack[]; source: GuestDataSource}> {
    const context = await this.resolveContext(spotifyProfileId);
    if (!context) {
      return {tracks: await this.spotify.getPlaylistTracks(playlist, accessToken), source: 'spotify'};
    }

    const storageKey = `${context.spotifyUserId}_${playlist.id}`;
    const countKey = `${storageKey}_CachedTrackCount`;
    const timestampKey = `${storageKey}_lastUpdated`;
    const local = this.trackCandidate(
      this.storage.getItem(storageKey),
      this.storage.getItem(countKey),
      this.storage.getItem(timestampKey),
      playlist,
      'local'
    );
    if (local?.fresh && local.complete) return {tracks: local.value, source: local.source};

    // Request only this playlist's keys. Nothing is copied into the host's
    // storage, and this service deliberately performs no guest cache writes.
    const cloud = await this.loadCloudCandidate(
      context,
      [storageKey, countKey, timestampKey],
      entries => this.trackCandidate(
        entries.get(storageKey) || null,
        entries.get(countKey) || null,
        entries.get(timestampKey) || null,
        playlist,
        'cloud'
      )
    );
    if (cloud?.fresh && cloud.complete) return {tracks: cloud.value, source: cloud.source};

    try {
      return {tracks: await this.spotify.getPlaylistTracks(playlist, accessToken), source: 'spotify'};
    } catch (error) {
      const fallback = [cloud, local].find(candidate => !!candidate?.complete);
      if (fallback) return {tracks: fallback.value, source: fallback.source};
      throw error;
    }
  }

  private async resolveContext(spotifyProfileId: string): Promise<GuestCacheContext | null> {
    if (this.contextProfileId !== spotifyProfileId) {
      this.contextProfileId = spotifyProfileId;
      this.contextPromise = this.createContext(spotifyProfileId);
    }
    return this.contextPromise;
  }

  private async createContext(spotifyProfileId: string): Promise<GuestCacheContext | null> {
    await this.storage.initFromDB();
    const storedSpotifyId = this.storage.getItem('spotifyUserId');
    const localAccountMatches = this.sameSpotifyAccount(storedSpotifyId, spotifyProfileId);

    const {data: {session}} = await this.supabase.client.auth.getSession();
    if (!session?.user) {
      return localAccountMatches && storedSpotifyId
        ? {spotifyUserId: storedSpotifyId, supabaseUserId: null, cloudBackupActive: false}
        : null;
    }

    let sessionSpotifyId = session.user.user_metadata?.['provider_id'] || null;
    const profile = await this.supabase.loadUserProfile(session.user.id);
    sessionSpotifyId = profile?.spotify_id || sessionSpotifyId;
    if (!this.sameSpotifyAccount(sessionSpotifyId, spotifyProfileId)) {
      return localAccountMatches && storedSpotifyId
        ? {spotifyUserId: storedSpotifyId, supabaseUserId: null, cloudBackupActive: false}
        : null;
    }

    const cacheSpotifyId = localAccountMatches && storedSpotifyId
      ? storedSpotifyId
      : sessionSpotifyId || spotifyProfileId;
    const cloudBackupActive = await this.supabase.checkBackupActive(session.user.id) === true;
    return {
      spotifyUserId: cacheSpotifyId,
      supabaseUserId: session.user.id,
      cloudBackupActive
    };
  }

  private async loadCloudCandidate<T>(
    context: GuestCacheContext,
    keys: string[],
    mapCandidate: (entries: Map<string, string>) => CacheCandidate<T> | null
  ): Promise<CacheCandidate<T> | null> {
    if (!context.cloudBackupActive || !context.supabaseUserId) return null;
    const rows = await this.supabase.loadUserCache(context.supabaseUserId, keys);
    const entries = new Map(rows.map(row => [row.key, row.value]));
    return mapCandidate(entries);
  }

  private playlistCandidate(
    raw: string | null,
    lastUpdated: string | null,
    source: CacheCandidate<ComparePlaylist[]>['source']
  ): CacheCandidate<ComparePlaylist[]> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const playlists = this.spotify.normalizeCachedPlaylists(parsed);
      if (playlists.length === 0) return null;
      return {value: playlists, source, fresh: this.isFresh(lastUpdated), complete: true};
    } catch {
      return null;
    }
  }

  private trackCandidate(
    raw: string | null,
    cachedTrackCount: string | null,
    lastUpdated: string | null,
    playlist: ComparePlaylist,
    source: CacheCandidate<CompareTrack[]>['source']
  ): CacheCandidate<CompareTrack[]> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const tracks = this.spotify.normalizeCachedTracks(parsed);
      const expectedCachedCount = this.parseStoredNumber(cachedTrackCount);
      const complete = playlist.total === 0 || (
        tracks.length > 0 && (expectedCachedCount === null || tracks.length >= expectedCachedCount)
      );
      return {value: tracks, source, fresh: this.isFresh(lastUpdated), complete};
    } catch {
      return null;
    }
  }

  private isFresh(lastUpdated: string | null): boolean {
    if (!lastUpdated) return false;
    const timestamp = Number(lastUpdated);
    if (!Number.isFinite(timestamp)) return false;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(1, 0, 0, 0);
    if (now.getTime() < cutoff.getTime()) cutoff.setDate(cutoff.getDate() - 1);
    return timestamp >= cutoff.getTime();
  }

  private parseStoredNumber(value: string | null): number | null {
    if (value === null) return null;
    try {
      const parsed = JSON.parse(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private sameSpotifyAccount(left: string | null, right: string): boolean {
    if (!left) return false;
    return this.stripDevSuffix(left) === this.stripDevSuffix(right);
  }

  private stripDevSuffix(userId: string): string {
    return userId.endsWith('_dev') ? userId.slice(0, -4) : userId;
  }
}
