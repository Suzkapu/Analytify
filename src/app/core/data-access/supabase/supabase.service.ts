import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '@env/environment';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {KeyedSerialTaskQueue} from '@core/performance/async-load';
import {SpotifyNavigationService} from '@core/navigation/spotify-navigation.service';

const console = createScopedLogger('Supabase');

export interface PastTopItem {
  kind: 'track' | 'artist' | 'genre';
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string;
  spotifyUrl: string;
  bestRank: number;
  firstSeen: string;
  lastSeen: string;
  appearances: number;
}

function parseSnapshotTimestamp(snapshotDate?: string, createdAt?: string): number {
  if (snapshotDate) {
    const parts = snapshotDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day).getTime();
    }
  }
  return new Date(createdAt || '').getTime();
}

function getDailyCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setHours(1, 0, 0, 0);
  if (now.getTime() < cutoff.getTime()) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
}

function getDailySnapshotDate(now: Date = new Date()): string {
  const cutoff = getDailyCutoff(now);
  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, '0');
  const day = String(cutoff.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStatsSnapshotCutoff(maxAgeDays: number): string {
  const cutoff = getDailyCutoff();
  cutoff.setDate(cutoff.getDate() - Math.max(0, maxAgeDays - 1));
  return getDailySnapshotDate(cutoff);
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public client: SupabaseClient;
  private readonly statsSnapshotWrites = new KeyedSerialTaskQueue();

  constructor(private readonly spotifyNavigation: SpotifyNavigationService = new SpotifyNavigationService()) {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        flowType: 'pkce',
        // The Angular callback component performs the exchange explicitly so
        // the one-time code cannot be consumed by two competing flows.
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true
      }
    });
  }

  /** Ensures the Supabase session is still valid, refreshing if needed.
   *  Prevents "No API key found" errors caused by expired JWTs during long syncs. */
  private async ensureSession(): Promise<void> {
    try {
      const { data: { session }, error } = await this.client.auth.getSession();
      if (error || !session) {
        console.warn('[SupabaseService] Session missing or expired, attempting refresh...');
        const { error: refreshErr } = await this.client.auth.refreshSession();
        if (refreshErr) {
          console.warn('[SupabaseService] Session refresh failed:', refreshErr.message);
        }
      }
    } catch (e) {
      console.warn('[SupabaseService] ensureSession error:', e);
    }
  }

  /** Checks if database backup is active for the user */
  async checkBackupActive(supabaseUserId: string): Promise<boolean | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('backup_active')
        .eq('id', supabaseUserId)
        .maybeSingle();
      if (error) throw error;
      return data ? !!data.backup_active : null;
    } catch (e) {
      console.warn('[SupabaseService] Failed to check backup status:', e);
      return null;
    }
  }

  /** Loads the persisted user profile before the UI falls back to Spotify. */
  async loadUserProfile(supabaseUserId: string): Promise<any | null> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('spotify_id, display_name, profile_pic_url')
        .eq('id', supabaseUserId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) {
      console.warn('[SupabaseService] Failed to load user profile:', e);
      return null;
    }
  }

  /** Updates database backup status for the user */
  async updateBackupActive(supabaseUserId: string, active: boolean): Promise<void> {
    try {
      const { error } = await this.client
        .from('users')
        .update({ backup_active: active })
        .eq('id', supabaseUserId);
      if (error) throw error;
    } catch (e) {
      console.error('[SupabaseService] Failed to update backup status:', e);
      throw e;
    }
  }

  /** Deletes all synced data connected to this profile from the database.
   *  Because of ON DELETE CASCADE constraints, deleting the row in the
   *  'users' table automatically erases user_cache, listening history,
   *  stats snapshots, playlist-sharing grants, and top-items history while
   *  keeping non-personal catalog metadata such as tracks and artists. */
  async deleteUserProfileData(supabaseUserId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('users')
        .delete()
        .eq('id', supabaseUserId);
      if (error) throw error;
    } catch (e) {
      console.error('[SupabaseService] Failed to delete user profile data:', e);
      throw e;
    }
  }

  /** Returns true if the URL is the Spotify liked-songs placeholder (not a real album/artist image) */
  private isPlaceholderImage(url: string | null | undefined): boolean {
    return !url || url === 'https://misc.scdn.co/liked-songs/liked-songs-300.png';
  }

  private mapSnapshotGenres(rows: any[]): any[] {
    const rawGenres = [...(rows || [])].sort((a: any, b: any) => a.rank - b.rank);
    const totalWeight = rawGenres.reduce((sum: number, row: any) => sum + (row.weight || 0), 0);
    const weightsArePercentages = totalWeight <= 100 &&
      rawGenres.every((row: any) => (row.weight || 0) <= 100);

    return rawGenres.map((row: any) => ({
      name: row.genre_name,
      count: row.weight,
      percentage: weightsArePercentages
        ? row.weight
        : (totalWeight > 0 ? Math.min(100, Math.round((row.weight / totalWeight) * 100)) : 0)
    }));
  }

  private mapTrackArtists(rows: any[]): any[] {
    return [...(rows || [])]
      .sort((a: any, b: any) => (a.artist_rank || 0) - (b.artist_rank || 0))
      .map((row: any) => ({
        id: row.artists?.id,
        name: row.artists?.name
      }))
      .filter((artist: any) => !!artist.id);
  }

  private async ingestCatalog(
    kind: 'artists' | 'albums' | 'tracks',
    items: any[],
    relationships: any[] = []
  ): Promise<void> {
    if (items.length === 0 && relationships.length === 0) return;
    const {error} = await this.client.rpc('ingest_spotify_catalog', {
      p_kind: kind,
      p_items: items,
      p_relationships: relationships
    });
    if (error) throw error;
  }

  /** Syncs Spotify artists metadata into the database */
  async syncArtists(artists: any[], onlyInsertMissing = false): Promise<void> {
    if (!artists || artists.length === 0) return;
    
    try {
      // Deduplicate by id to prevent PG 21000 "ON CONFLICT DO UPDATE cannot affect row a second time"
      const artistsMap = new Map<string, any>();
      artists.forEach(a => { if (a && a.id) artistsMap.set(a.id, a); });
      let uniqueArtists = Array.from(artistsMap.values());

      if (uniqueArtists.length === 0) return;

      const artistIds = uniqueArtists.map(a => a.id);
      const { data: existingArtists, error: existingArtistsError } = await this.client
        .from('artists')
        .select('id, name, image_url, spotify_url')
        .in('id', artistIds);
      if (existingArtistsError) throw existingArtistsError;
      const existingArtistMap = new Map<string, any>(
        (existingArtists || []).map((artist: any) => [artist.id, artist])
      );

      if (onlyInsertMissing) {
        uniqueArtists = uniqueArtists.filter(a => !existingArtistMap.has(a.id));
        if (uniqueArtists.length === 0) return;
      }

      const rawImageUrls = new Map<string, string | null>(uniqueArtists.map(a => [
        a.id,
        a.images?.[0]?.url || a.imageUrl || a.image_url || null
      ]));

      const artistsToInsert = uniqueArtists.map(a => {
        const existing = existingArtistMap.get(a.id);
        const incomingImage = rawImageUrls.get(a.id);
        return {
          id: a.id,
          name: a.name || existing?.name || 'Unknown Artist',
          image_url: this.isPlaceholderImage(incomingImage)
            ? (existing?.image_url || null)
            : incomingImage,
          spotify_url: this.spotifyNavigation.sanitizeSpotifyUrl(
            a.external_urls?.spotify || a.spotifyUrl || a.spotify_url || existing?.spotify_url,
            'artist'
          ),
          last_updated: new Date().toISOString()
        };
      });

      if (artistsToInsert.length > 0) {
        await this.ingestCatalog('artists', artistsToInsert);
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing artists:', e);
      throw e;
    }
  }

  /** Loads a normalized artist profile before a direct Spotify lookup. */
  async loadArtistById(artistId: string): Promise<any | null> {
    if (!artistId) return null;
    try {
      const { data, error } = await this.client
        .from('artists')
        .select('id, name, image_url, spotify_url')
        .eq('id', artistId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const safeSpotifyUrl = this.spotifyNavigation.sanitizeSpotifyUrl(data.spotify_url, 'artist');
      return {
        id: data.id,
        name: data.name,
        images: data.image_url ? [{ url: data.image_url }] : [],
        external_urls: safeSpotifyUrl ? { spotify: safeSpotifyUrl } : undefined
      };
    } catch (e) {
      console.warn('[SupabaseService] Failed to load artist:', e);
      return null;
    }
  }

  /** Loads normalized artist profiles in batches for cache/image recovery. */
  async loadArtistsByIds(artistIds: string[]): Promise<any[]> {
    const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    try {
      const artists: any[] = [];
      for (let offset = 0; offset < uniqueIds.length; offset += 100) {
        const batch = uniqueIds.slice(offset, offset + 100);
        const { data, error } = await this.client
          .from('artists')
          .select('id, name, image_url, spotify_url')
          .in('id', batch);
        if (error) throw error;
        artists.push(...(data || []));
      }

      return artists.map(artist => {
        const safeSpotifyUrl = this.spotifyNavigation.sanitizeSpotifyUrl(artist.spotify_url, 'artist');
        return {
          id: artist.id,
          name: artist.name,
          images: artist.image_url ? [{ url: artist.image_url }] : [],
          external_urls: safeSpotifyUrl ? { spotify: safeSpotifyUrl } : undefined
        };
      });
    } catch (e) {
      console.warn('[SupabaseService] Failed to load artist profiles:', e);
      return [];
    }
  }

  /** Syncs Spotify albums metadata into the database */
  async syncAlbums(albums: any[], onlyInsertMissing = false): Promise<void> {
    if (!albums || albums.length === 0) return;

    try {
      // Deduplicate by id to prevent PG 21000 "ON CONFLICT DO UPDATE cannot affect row a second time"
      const albumsMap = new Map<string, any>();
      albums.forEach(a => { if (a && a.id) albumsMap.set(a.id, a); });
      let uniqueAlbums = Array.from(albumsMap.values());

      if (uniqueAlbums.length === 0) return;

      const albumIds = uniqueAlbums.map(a => a.id);
      const { data: existingAlbums, error: existingAlbumsError } = await this.client
        .from('albums')
        .select('id, name, album_type, total_tracks, release_date, release_date_precision, image_url, spotify_url, restriction_reason, upc, ean')
        .in('id', albumIds);
      if (existingAlbumsError) throw existingAlbumsError;
      const existingAlbumMap = new Map<string, any>(
        (existingAlbums || []).map((album: any) => [album.id, album])
      );

      if (onlyInsertMissing) {
        uniqueAlbums = uniqueAlbums.filter(a => !existingAlbumMap.has(a.id));
        if (uniqueAlbums.length === 0) return;
      }

      const albumsToInsert = uniqueAlbums.map(a => {
        const existing = existingAlbumMap.get(a.id);
        const releaseDate = a.release_date && a.release_date.trim()
          ? (a.release_date.length === 4
            ? `${a.release_date}-01-01`
            : (a.release_date.length === 7 ? `${a.release_date}-01` : a.release_date))
          : existing?.release_date || null;
        const incomingImage = a.images?.[0]?.url || a.imageUrl || a.image_url || null;
        return {
          id: a.id,
          name: a.name || existing?.name || 'Unknown Album',
          album_type: a.album_type || a.albumType || existing?.album_type || 'album',
          total_tracks: Number.isFinite(a.total_tracks ?? a.totalTracks)
            ? (a.total_tracks ?? a.totalTracks)
            : (existing?.total_tracks ?? 1),
          release_date: releaseDate,
          release_date_precision: a.release_date_precision || a.releaseDatePrecision || existing?.release_date_precision || 'year',
          image_url: this.isPlaceholderImage(incomingImage)
            ? (existing?.image_url || null)
            : incomingImage,
          spotify_url: this.spotifyNavigation.sanitizeSpotifyUrl(
            a.external_urls?.spotify || a.spotifyUrl || a.spotify_url || existing?.spotify_url,
            'album'
          ),
          restriction_reason: a.restrictions?.reason || existing?.restriction_reason || null,
          upc: a.external_ids?.upc || a.upc || existing?.upc || null,
          ean: a.external_ids?.ean || a.ean || existing?.ean || null,
          last_updated: new Date().toISOString()
        };
      });

      const albumArtistsToInsert: any[] = [];
      uniqueAlbums.forEach(a => {
        if (a.id && Array.isArray(a.artists)) {
          a.artists.forEach((art: any) => {
            if (art.id) {
               albumArtistsToInsert.push({ album_id: a.id, artist_id: art.id });
            }
          });
        }
      });

      // Extract all unique artist ids from albums to protect foreign keys in album_artists
      const artistIds = new Set<string>();
      uniqueAlbums.forEach(a => {
        if (a.artists) {
          a.artists.forEach((art: any) => {
            if (art.id) artistIds.add(art.id);
          });
        }
      });

      if (artistIds.size > 0) {
        const { data: existingArtists, error: existingArtistsError } = await this.client
          .from('artists')
          .select('id')
          .in('id', Array.from(artistIds));
        if (existingArtistsError) throw existingArtistsError;
        const existingArtistIds = new Set(existingArtists ? existingArtists.map(e => e.id) : []);
        const missingArtistIds = Array.from(artistIds).filter(id => !existingArtistIds.has(id));

        if (missingArtistIds.length > 0) {
          const artistPlaceholders = missingArtistIds.map(id => {
            const albumWithArtist = uniqueAlbums.find(a => a.artists?.some((art: any) => art.id === id));
            const artistObj = albumWithArtist?.artists?.find((art: any) => art.id === id);
            return {
              id: id,
              name: artistObj?.name || 'Unknown Artist',
              last_updated: new Date().toISOString()
            };
          });

          await this.ingestCatalog('artists', artistPlaceholders);
        }
      }

      if (albumsToInsert.length > 0 || albumArtistsToInsert.length > 0) {
        await this.ingestCatalog('albums', albumsToInsert, albumArtistsToInsert);
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing albums:', e);
      throw e;
    }
  }

  /** Syncs Spotify tracks metadata into the database */
  async syncTracks(tracks: any[], onlyInsertMissing = false): Promise<void> {
    if (!tracks || tracks.length === 0) return;

    try {
      // Deduplicate by id to prevent PG 21000 "ON CONFLICT DO UPDATE cannot affect row a second time"
      const tracksMap = new Map<string, any>();
      tracks.forEach(t => { if (t && t.id) tracksMap.set(t.id, t); });
      let uniqueTracks = Array.from(tracksMap.values());

      if (uniqueTracks.length === 0) return;

      const trackIds = uniqueTracks.map(t => t.id);
      const { data: existingTracks, error: existingTracksError } = await this.client
        .from('tracks')
        .select('id, name, album_id, duration_ms, explicit, spotify_url, track_number, disc_number, is_playable, is_local, isrc, restriction_reason')
        .in('id', trackIds);
      if (existingTracksError) throw existingTracksError;
      const existingTrackMap = new Map<string, any>(
        (existingTracks || []).map((track: any) => [track.id, track])
      );

      if (onlyInsertMissing) {
        uniqueTracks = uniqueTracks.filter(t => !existingTrackMap.has(t.id));
        if (uniqueTracks.length === 0) return;
      }

      // Extract all unique album ids from tracks to protect foreign keys
      const albumIds = new Set<string>();
      uniqueTracks.forEach(t => {
        const albId = t.album?.id || t.albumId;
        if (albId) albumIds.add(albId);
      });

      if (albumIds.size > 0) {
        const { data: existingAlbums, error: existingAlbumsError } = await this.client
          .from('albums')
          .select('id')
          .in('id', Array.from(albumIds));
        if (existingAlbumsError) throw existingAlbumsError;
        const existingAlbumIds = new Set(existingAlbums ? existingAlbums.map(e => e.id) : []);
        const missingAlbumIds = Array.from(albumIds).filter(id => !existingAlbumIds.has(id));

        if (missingAlbumIds.length > 0) {
          const albumPlaceholderToInsert = missingAlbumIds.map(id => {
            const trackWithAlbum = uniqueTracks.find(t => (t.album?.id || t.albumId) === id);
            const name = trackWithAlbum?.album?.name || 'Unknown Album';
            const imageUrl = trackWithAlbum?.album?.images?.[0]?.url || trackWithAlbum?.album?.imageUrl || null;
            return {
              id: id,
              name: name,
              album_type: 'album',
              total_tracks: 1,
              release_date: null,
              release_date_precision: 'year',
              image_url: imageUrl,
              last_updated: new Date().toISOString()
            };
          });

          await this.ingestCatalog('albums', albumPlaceholderToInsert);
        }
      }

      // Extract all unique artist ids from tracks to protect foreign keys in track_artists
      const artistIds = new Set<string>();
      uniqueTracks.forEach(t => {
        if (t.artists) {
          t.artists.forEach((art: any) => {
            if (art.id) artistIds.add(art.id);
          });
        }
      });

      if (artistIds.size > 0) {
        const { data: existingArtists, error: existingArtistsError } = await this.client
          .from('artists')
          .select('id')
          .in('id', Array.from(artistIds));
        if (existingArtistsError) throw existingArtistsError;
        const existingArtistIds = new Set(existingArtists ? existingArtists.map(e => e.id) : []);
        const missingArtistIds = Array.from(artistIds).filter(id => !existingArtistIds.has(id));

        if (missingArtistIds.length > 0) {
          const artistPlaceholders = missingArtistIds.map(id => {
            const trackWithArtist = uniqueTracks.find(t => t.artists?.some((a: any) => a.id === id));
            const artistObj = trackWithArtist?.artists?.find((a: any) => a.id === id);
            return {
              id: id,
              name: artistObj?.name || 'Unknown Artist',
              last_updated: new Date().toISOString()
            };
          });

          await this.ingestCatalog('artists', artistPlaceholders);
        }
      }

      const tracksToInsert = uniqueTracks.map(t => {
        const existing = existingTrackMap.get(t.id);
        const durationMs = t.duration_ms ?? t.durationMs;
        const trackNumber = t.track_number ?? t.trackNumber;
        const discNumber = t.disc_number ?? t.discNumber;
        return {
          id: t.id,
          name: t.name || existing?.name || 'Unknown Track',
          album_id: t.album?.id || t.albumId || existing?.album_id || null,
          duration_ms: Number.isFinite(durationMs) ? durationMs : (existing?.duration_ms ?? 0),
          explicit: typeof t.explicit === 'boolean' ? t.explicit : (existing?.explicit ?? false),
          spotify_url: this.spotifyNavigation.sanitizeSpotifyUrl(
            t.external_urls?.spotify || t.spotifyUrl || t.spotify_url || existing?.spotify_url,
            'track'
          ),
          track_number: Number.isFinite(trackNumber) ? trackNumber : (existing?.track_number ?? 1),
          disc_number: Number.isFinite(discNumber) ? discNumber : (existing?.disc_number ?? 1),
          is_playable: typeof t.is_playable === 'boolean' ? t.is_playable : (existing?.is_playable ?? true),
          is_local: typeof t.is_local === 'boolean' ? t.is_local : (existing?.is_local ?? false),
          isrc: t.external_ids?.isrc || existing?.isrc || null,
          restriction_reason: t.restrictions?.reason || existing?.restriction_reason || null,
          last_updated: new Date().toISOString()
        };
      });

      const trackArtistsToInsert: any[] = [];
      uniqueTracks.forEach(t => {
        if (t.id && Array.isArray(t.artists)) {
          t.artists.forEach((art: any, rank: number) => {
            if (art.id) {
              trackArtistsToInsert.push({ track_id: t.id, artist_id: art.id, artist_rank: rank });
            }
          });
        }
      });

      if (tracksToInsert.length > 0 || trackArtistsToInsert.length > 0) {
        await this.ingestCatalog('tracks', tracksToInsert, trackArtistsToInsert);
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing tracks:', e);
      throw e;
    }
  }

  /** Syncs a user's listening history records to database */
  async syncListeningHistory(supabaseUserId: string, items: any[]): Promise<void> {
    if (!items || items.length === 0) return;

    try {
      await this.ensureSession();

      // 1. Collect all tracks, artists, and albums — deduplicated by id
      const tracksMap = new Map<string, any>();
      items.map(i => i.track).filter(t => t?.id).forEach(t => tracksMap.set(t.id, t));
      const rawTracks = Array.from(tracksMap.values());

      const albumsMap2 = new Map<string, any>();
      rawTracks.map(t => t.album).filter(al => al?.id).forEach(al => albumsMap2.set(al.id, al));
      const rawAlbums = Array.from(albumsMap2.values());
      
      const artistsMap = new Map<string, any>();
      // Collect track artists
      rawTracks.forEach(t => {
        if (t.artists) {
          t.artists.forEach((art: any) => {
            if (art && art.id && !artistsMap.has(art.id)) artistsMap.set(art.id, art);
          });
        }
      });
      // Collect album artists
      rawAlbums.forEach(al => {
        if (al.artists) {
          al.artists.forEach((art: any) => {
            if (art && art.id && !artistsMap.has(art.id)) artistsMap.set(art.id, art);
          });
        }
      });
      // Collect other raw artists from items directly
      items.flatMap(i => i.artists || []).forEach((art: any) => {
        if (art && art.id) artistsMap.set(art.id, art);
      });
      const allArtists = Array.from(artistsMap.values());

      // 2. Sync metadata in order of dependencies (artists -> albums -> tracks)
      await this.syncArtists(allArtists);
      await this.syncAlbums(rawAlbums);
      await this.syncTracks(rawTracks);

      // 3. Format history records
      const historyRowsByKey = new Map<string, any>();
      items.map(item => ({
        user_id: supabaseUserId,
        track_id: item.track?.id || item.trackId,
        played_at: item.played_at
      })).filter(row => !!row.user_id && !!row.track_id && !!row.played_at)
        .forEach(row => {
          historyRowsByKey.set(
            `${row.user_id}:${row.played_at}:${row.track_id}`,
            row
          );
        });
      const historyRows = Array.from(historyRowsByKey.values());

      if (historyRows.length === 0) return;

      // 4. Insert listening history
      const { error } = await this.client
        .from('listening_history')
        .upsert(historyRows, {
          onConflict: 'user_id,played_at,track_id',
          ignoreDuplicates: true
        });

      if (error) throw error;
      console.log(`[SupabaseService] Synced ${historyRows.length} history records to database.`);

    } catch (e) {
      console.error('[SupabaseService] Error syncing listening history:', e);
      throw e;
    }
  }

  /** Checks if listening history already has data for today */
  async hasHistoryForToday(supabaseUserId: string): Promise<boolean> {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data, error } = await this.client
        .from('listening_history')
        .select('played_at')
        .eq('user_id', supabaseUserId)
        .gte('played_at', startOfToday.toISOString())
        .limit(1);

      if (error) throw error;
      return data && data.length > 0;
    } catch (e) {
      console.warn('[SupabaseService] Error checking today\'s history in database:', e);
      return false;
    }
  }

  /** Loads recently played tracks from database */
  async loadListeningHistoryFromDB(supabaseUserId: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('listening_history')
        .select(`
          played_at,
          track_id,
          tracks (
            id, name, duration_ms, explicit, spotify_url,
            albums ( id, name, image_url ),
            track_artists (
              artist_rank,
              artists ( id, name )
            )
          )
        `)
        .eq('user_id', supabaseUserId)
        .order('played_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data) return [];

      // Remap flat db payload back to standard Spotify recently-played item format
      return data.map((row: any) => {
        const t = row.tracks;
        if (!t) return null;
        
        // Extract artists list
        const artists = this.mapTrackArtists(t.track_artists);

        return {
          played_at: row.played_at,
          track: {
            id: t.id,
            name: t.name,
            duration_ms: t.duration_ms,
            explicit: t.explicit,
            external_urls: { spotify: t.spotify_url },
            album: {
              id: t.albums?.id,
              name: t.albums?.name,
              images: t.albums?.image_url ? [{ url: t.albums.image_url }] : []
            },
            artists: artists
          }
        };
      }).filter(item => !!item);
    } catch (e) {
      console.error('[SupabaseService] Error loading listening history from DB:', e);
      return [];
    }
  }

  /** Checks for a snapshot inside the range-specific freshness window. */
  async hasRecentStatsSnapshot(
    supabaseUserId: string,
    range: string,
    maxAgeDays: number
  ): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select('id')
        .eq('user_id', supabaseUserId)
        .eq('range', range)
        .gte('snapshot_date', getStatsSnapshotCutoff(maxAgeDays))
        .limit(1);

      if (error) throw error;
      return data && data.length > 0;
    } catch (e) {
      console.warn('[SupabaseService] Error checking recent stats snapshot:', e);
      return false;
    }
  }

  /** Loads the newest stats snapshot inside the requested freshness window. */
  async loadLatestStatsSnapshot(
    supabaseUserId: string,
    range: string,
    maxAgeDays: number
  ): Promise<any> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select(`
          id, snapshot_date, explicit_percentage, genre_diversity,
          stats_snapshot_tracks (
            rank,
            tracks (
              id, name, duration_ms, explicit, spotify_url,
              albums ( id, name, image_url ),
              track_artists (
                artist_rank,
                artists ( id, name )
              )
            )
          ),
          stats_snapshot_artists (
            rank,
            artists (
              id, name, image_url, spotify_url
            )
          ),
          stats_snapshot_genres (
            rank,
            genre_name,
            weight
          )
        `)
        .eq('user_id', supabaseUserId)
        .eq('range', range)
        .gte('snapshot_date', getStatsSnapshotCutoff(maxAgeDays))
        .order('snapshot_date', {ascending: false})
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Map tracks back to Spotify-compatible structures
      const topTracks = (data.stats_snapshot_tracks || [])
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => {
          const t = row.tracks;
          if (!t) return null;
          const albumImageUrl = t.albums?.image_url || null;
          return {
            id: t.id,
            name: t.name,
            duration_ms: t.duration_ms,
            explicit: t.explicit,
            external_urls: { spotify: t.spotify_url },
            spotifyUrl: t.spotify_url,
            // albumCover is the shortcut checked first by getTrackCover()
            albumCover: albumImageUrl,
            album: {
              id: t.albums?.id,
              name: t.albums?.name,
              images: albumImageUrl ? [{ url: albumImageUrl }] : []
            },
            artists: this.mapTrackArtists(t.track_artists)
          };
        }).filter((t: any) => !!t);

      // Map artists back to Spotify-compatible structures
      const topArtists = (data.stats_snapshot_artists || [])
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => {
          const art = row.artists;
          if (!art) return null;
          return {
            id: art.id,
            name: art.name,
            external_urls: { spotify: art.spotify_url },
            images: art.image_url ? [{ url: art.image_url }] : []
          };
        }).filter((a: any) => !!a);

      return {
        snapshotDate: data.snapshot_date,
        explicitPercentage: data.explicit_percentage,
        genreDiversity: data.genre_diversity,
        topTracks,
        topArtists,
        topGenres: this.mapSnapshotGenres(data.stats_snapshot_genres || [])
      };

    } catch (e) {
      console.error('[SupabaseService] Error loading stats snapshot from DB:', e);
      return null;
    }
  }

  /** Searches only matching historical snapshot rows; full history stays in Supabase. */
  async searchPastTopItems(
    range: string,
    kind: 'track' | 'artist' | 'genre',
    query: string,
    limit = 20
  ): Promise<PastTopItem[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const {data, error} = await this.client.rpc('search_past_top_items', {
      p_range: range,
      p_kind: kind,
      p_query: trimmed,
      p_limit: limit
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      kind: row.kind,
      id: row.item_id,
      name: row.item_name,
      subtitle: row.subtitle || '',
      imageUrl: row.image_url || '',
      spotifyUrl: row.spotify_url || '',
      bestRank: Number(row.best_rank),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      appearances: Number(row.appearances || 0)
    }));
  }

  /** Loads all stats snapshots for a user from database for a specific range */
  async loadAllStatsSnapshots(supabaseUserId: string, range: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select(`
          id, explicit_percentage, genre_diversity, created_at, snapshot_date,
          stats_snapshot_tracks (
            rank,
            tracks (
              id, name, duration_ms, explicit, spotify_url,
              albums ( id, name, image_url ),
              track_artists (
                artist_rank,
                artists ( id, name )
              )
            )
          ),
          stats_snapshot_artists (
            rank,
            artists (
              id, name, image_url, spotify_url
            )
          ),
          stats_snapshot_genres (
            rank,
            genre_name,
            weight
          )
        `)
        .eq('user_id', supabaseUserId)
        .eq('range', range)
        .order('snapshot_date', { ascending: true });

      if (error) throw error;
      if (!data) return [];

      return data.map((row: any) => {
        // Map tracks back to Spotify-compatible structures
        const topTracks = (row.stats_snapshot_tracks || [])
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((subRow: any) => {
            const t = subRow.tracks;
            if (!t) return null;
            const albumImageUrl = t.albums?.image_url || null;
            return {
              id: t.id,
              name: t.name,
              duration_ms: t.duration_ms,
              explicit: t.explicit,
              external_urls: { spotify: t.spotify_url },
              spotifyUrl: t.spotify_url,
              albumCover: albumImageUrl,
              album: {
                id: t.albums?.id,
                name: t.albums?.name,
                images: albumImageUrl ? [{ url: albumImageUrl }] : []
              },
              artists: this.mapTrackArtists(t.track_artists)
            };
          }).filter((t: any) => !!t);

        // Map artists back to Spotify-compatible structures
        const topArtists = (row.stats_snapshot_artists || [])
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((subRow: any) => {
            const art = subRow.artists;
            if (!art) return null;
            return {
              id: art.id,
              name: art.name,
              external_urls: { spotify: art.spotify_url },
              images: art.image_url ? [{ url: art.image_url }] : []
            };
          }).filter((a: any) => !!a);

        return {
          userId: supabaseUserId,
          range: range,
          timestamp: parseSnapshotTimestamp(row.snapshot_date, row.created_at),
          snapshotDate: row.snapshot_date,
          explicitPercentage: Number(row.explicit_percentage),
          genreDiversity: row.genre_diversity,
          topTracks,
          topArtists,
          topGenres: this.mapSnapshotGenres(row.stats_snapshot_genres || [])
        };
      });
    } catch (e) {
      console.error('[SupabaseService] Error loading all stats snapshots from DB:', e);
      return [];
    }
  }

  /** Loads all stats snapshots metadata without item joins for performance. */
  async loadAllStatsSnapshotsMetadata(supabaseUserId: string, range: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select('id, explicit_percentage, genre_diversity, created_at, snapshot_date')
        .eq('user_id', supabaseUserId)
        .eq('range', range)
        .order('snapshot_date', { ascending: true });

      if (error) throw error;
      if (!data) return [];

      return data.map((row: any) => ({
        id: row.id,
        userId: supabaseUserId,
        range: range,
        timestamp: parseSnapshotTimestamp(row.snapshot_date, row.created_at),
        snapshotDate: row.snapshot_date,
        explicitPercentage: Number(row.explicit_percentage),
        genreDiversity: row.genre_diversity,
        topTracks: [],
        topArtists: [],
        topGenres: [],
        isLoaded: false
      }));
    } catch (e) {
      console.error('[SupabaseService] Error loading stats snapshots metadata:', e);
      return [];
    }
  }

  /** Loads only the ranks for one item across snapshot dates. */
  async loadStatsItemTrend(
    supabaseUserId: string,
    range: string,
    category: 'tracks' | 'artists' | 'genres',
    identities: string[]
  ): Promise<Array<{timestamp: number; snapshotDate: string; rank: number}>> {
    const keys = Array.from(new Set(identities.filter(Boolean)));
    if (keys.length === 0) return [];

    const table = category === 'tracks'
      ? 'stats_snapshot_tracks'
      : category === 'artists'
        ? 'stats_snapshot_artists'
        : 'stats_snapshot_genres';
    const identityColumn = category === 'tracks'
      ? 'track_id'
      : category === 'artists'
        ? 'artist_id'
        : 'genre_name';

    try {
      let query = this.client
        .from(table)
        .select(`rank, stats_snapshots!inner(user_id, range, snapshot_date, created_at)`)
        .eq('stats_snapshots.user_id', supabaseUserId)
        .eq('stats_snapshots.range', range);
      query = keys.length === 1
        ? query.eq(identityColumn, keys[0])
        : query.in(identityColumn, keys);
      const {data, error} = await query;
      if (error) throw error;

      const byDate = new Map<string, {timestamp: number; snapshotDate: string; rank: number}>();
      (data || []).forEach((row: any) => {
        const snapshot = Array.isArray(row.stats_snapshots)
          ? row.stats_snapshots[0]
          : row.stats_snapshots;
        if (!snapshot?.snapshot_date) return;
        const point = {
          timestamp: parseSnapshotTimestamp(snapshot.snapshot_date, snapshot.created_at),
          snapshotDate: snapshot.snapshot_date,
          rank: Number(row.rank)
        };
        const previous = byDate.get(point.snapshotDate);
        if (!previous || point.rank < previous.rank) byDate.set(point.snapshotDate, point);
      });
      return Array.from(byDate.values()).sort((left, right) => left.timestamp - right.timestamp);
    } catch (error) {
      console.warn('[SupabaseService] Error loading stats item trend:', error);
      return [];
    }
  }

  /** Loads full details for a single stats snapshot by ID */
  async loadStatsSnapshotById(supabaseUserId: string, snapshotId: string): Promise<any | null> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select(`
          id, explicit_percentage, genre_diversity, created_at, snapshot_date, range,
          stats_snapshot_tracks (
            rank,
            tracks (
              id, name, duration_ms, explicit, spotify_url,
              albums ( id, name, image_url ),
              track_artists (
                artist_rank,
                artists ( id, name )
              )
            )
          ),
          stats_snapshot_artists (
            rank,
            artists (
              id, name, image_url, spotify_url
            )
          ),
          stats_snapshot_genres (
            rank,
            genre_name,
            weight
          )
        `)
        .eq('id', snapshotId)
        .eq('user_id', supabaseUserId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Map tracks back to Spotify-compatible structures
      const topTracks = (data.stats_snapshot_tracks || [])
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => {
          const t = row.tracks;
          if (!t) return null;
          const albumImageUrl = t.albums?.image_url || null;
          return {
            id: t.id,
            name: t.name,
            duration_ms: t.duration_ms,
            explicit: t.explicit,
            external_urls: { spotify: t.spotify_url },
            spotifyUrl: t.spotify_url,
            albumCover: albumImageUrl,
            album: {
              id: t.albums?.id,
              name: t.albums?.name,
              images: albumImageUrl ? [{ url: albumImageUrl }] : []
            },
            artists: this.mapTrackArtists(t.track_artists)
          };
        }).filter((t: any) => !!t);

      // Map artists back to Spotify-compatible structures
      const topArtists = (data.stats_snapshot_artists || [])
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => {
          const art = row.artists;
          if (!art) return null;
          return {
            id: art.id,
            name: art.name,
            external_urls: { spotify: art.spotify_url },
            images: art.image_url ? [{ url: art.image_url }] : []
          };
        }).filter((a: any) => !!a);

      return {
        id: data.id,
        userId: supabaseUserId,
        range: data.range,
        timestamp: parseSnapshotTimestamp(data.snapshot_date, data.created_at),
        snapshotDate: data.snapshot_date,
        explicitPercentage: Number(data.explicit_percentage),
        genreDiversity: data.genre_diversity,
        topTracks,
        topArtists,
        topGenres: this.mapSnapshotGenres(data.stats_snapshot_genres || []),
        isLoaded: true
      };
    } catch (e) {
      console.error('[SupabaseService] Error loading stats snapshot details:', e);
      return null;
    }
  }


  /** Saves a user stats snapshot to database */
  async saveStatsSnapshot(
    supabaseUserId: string,
    range: string,
    explicitPercentage: number,
    genreDiversity: number,
    topTracks: any[],
    topArtists: any[],
    topGenres: any[],
    onlyInsertMissing = false,
    customDateStr?: string
  ): Promise<void> {
    const snapshotDate = customDateStr || getDailySnapshotDate();
    return this.statsSnapshotWrites.run(
      `${supabaseUserId}:${range}:${snapshotDate}`,
      () => this.persistStatsSnapshot(
        supabaseUserId,
        range,
        explicitPercentage,
        genreDiversity,
        topTracks,
        topArtists,
        topGenres,
        onlyInsertMissing,
        snapshotDate
      )
    );
  }

  private async persistStatsSnapshot(
    supabaseUserId: string,
    range: string,
    explicitPercentage: number,
    genreDiversity: number,
    topTracks: any[],
    topArtists: any[],
    topGenres: any[],
    onlyInsertMissing: boolean,
    snapshotDate: string
  ): Promise<void> {

    try {
      await this.ensureSession();

      const todayStr = snapshotDate;
      const fetchedAt = new Date(`${snapshotDate}T01:00:00`).toISOString();

      // 1. Sync metadata objects (artists -> albums -> tracks) — deduplicated by id
      const tracksMap2 = new Map<string, any>();
      topTracks.filter(t => t?.id).forEach(t => tracksMap2.set(t.id, t));
      const rawTracks = Array.from(tracksMap2.values());

      const albumsMap3 = new Map<string, any>();
      rawTracks.map(t => t.album).filter(al => al?.id).forEach(al => albumsMap3.set(al.id, al));
      const rawAlbums = Array.from(albumsMap3.values());

      const artistsMap = new Map<string, any>();
      // Collect top artists
      topArtists.filter(a => !!a).forEach(art => {
        if (art.id) artistsMap.set(art.id, art);
      });
      // Collect track artists
      rawTracks.forEach(t => {
        if (t.artists) {
          t.artists.forEach((art: any) => {
            if (art && art.id && !artistsMap.has(art.id)) artistsMap.set(art.id, art);
          });
        }
      });
      // Collect album artists
      rawAlbums.forEach(al => {
        if (al.artists) {
          al.artists.forEach((art: any) => {
            if (art && art.id && !artistsMap.has(art.id)) artistsMap.set(art.id, art);
          });
        }
      });
      const allArtists = Array.from(artistsMap.values());

      await this.syncArtists(allArtists, onlyInsertMissing);
      await this.syncAlbums(rawAlbums, onlyInsertMissing);
      await this.syncTracks(rawTracks, onlyInsertMissing);

      // Build unique rank lists before replacing the snapshot in one locked
      // database transaction. This prevents browser and worker refreshes from
      // interleaving deletes and inserts for the same day.
      const seenTrackIds = new Set<string>();
      const seenTrackIdentities = new Set<string>();
      const trackLinks: any[] = [];
      topTracks.forEach(track => {
        if (!track?.id || seenTrackIds.has(track.id)) return;
        const name = (track.name || '').trim().toLowerCase();
        const artist = this.getTrackArtistName(track).trim().toLowerCase();
        const nameKey = name && artist ? `${name}:::${artist}` : '';
        if (nameKey && seenTrackIdentities.has(nameKey)) return;

        seenTrackIds.add(track.id);
        if (nameKey) seenTrackIdentities.add(nameKey);
        trackLinks.push({
          track_id: track.id,
          rank: trackLinks.length + 1
        });
      });

      const seenArtistIds = new Set<string>();
      const artistLinks: any[] = [];
      topArtists.forEach(artist => {
        if (artist?.id && !seenArtistIds.has(artist.id)) {
          seenArtistIds.add(artist.id);
          artistLinks.push({
            artist_id: artist.id,
            rank: artistLinks.length + 1
          });
        }
      });

      const seenGenres = new Set<string>();
      const genreLinks: any[] = [];
      topGenres.forEach(genre => {
        if (genre?.name && !seenGenres.has(genre.name)) {
          seenGenres.add(genre.name);
          genreLinks.push({
            genre_name: genre.name,
            rank: genreLinks.length + 1,
            weight: Math.round(Number.isFinite(genre.percentage)
              ? genre.percentage
              : (Number.isFinite(genre.count) ? genre.count : 0))
          });
        }
      });

      const {data: currentSnapshot, error: revisionError} = await this.client
        .from('stats_snapshots')
        .select('revision')
        .eq('user_id', supabaseUserId)
        .eq('range', range)
        .eq('snapshot_date', todayStr)
        .maybeSingle();
      if (revisionError) throw revisionError;
      const {error: replaceError} = await this.client.rpc('replace_stats_snapshot_v2', {
        p_user_id: supabaseUserId,
        p_range: range,
        p_snapshot_date: todayStr,
        p_explicit_percentage: explicitPercentage,
        p_genre_diversity: genreDiversity,
        p_tracks: trackLinks,
        p_artists: artistLinks,
        p_genres: genreLinks,
        p_fetched_at: fetchedAt,
        p_idempotency_key: `${supabaseUserId}:${range}:${todayStr}:${fetchedAt}`,
        p_expected_revision: Number(currentSnapshot?.revision || 0)
      });
      if (replaceError) throw replaceError;

      // last_synced_at is deliberately not a generic activity timestamp.
      // It advances only when all three current daily stats snapshots exist.
      if (snapshotDate === getDailySnapshotDate()) {
        await this.markDailyStatsCompleteIfReady(supabaseUserId);
      }

      console.log(`[SupabaseService] Saved stats snapshot for today (${todayStr}, ${range}) to database.`);
    } catch (e) {
      console.error('[SupabaseService] Error saving stats snapshot to DB:', e);
      throw e;
    }
  }

  /** Saves a serialized cache key-value pair to database */
  async saveUserCache(supabaseUserId: string, key: string, value: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('user_cache')
        .upsert({ 
          user_id: supabaseUserId, 
          key: key, 
          value: value, 
          updated_at: new Date().toISOString() 
        }, { onConflict: 'user_id,key' });
      if (error) throw error;
    } catch (e) {
      console.error(`[SupabaseService] Failed to save user cache for key ${key}:`, e);
      throw e;
    }
  }

  /** Loads cached key-value pairs for the user from database.
   *  Passing keys keeps feature-level cloud fallbacks small and deterministic. */
  async loadUserCache(
    supabaseUserId: string,
    keys?: string[]
  ): Promise<{ key: string; value: string; updated_at?: string }[]> {
    try {
      let query = this.client
        .from('user_cache')
        .select('key, value, updated_at')
        .eq('user_id', supabaseUserId);

      if (keys && keys.length > 0) {
        query = query.in('key', keys);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.info('[SupabaseService] No user cache found in database:', e);
      return [];
    }
  }

  async deleteUserCacheEntries(supabaseUserId: string, keys: string[]): Promise<void> {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    if (uniqueKeys.length === 0) return;

    const { error } = await this.client
      .from('user_cache')
      .delete()
      .eq('user_id', supabaseUserId)
      .in('key', uniqueKeys);
    if (error) throw error;
  }

  private async markDailyStatsCompleteIfReady(supabaseUserId: string): Promise<void> {
    const requiredRanges = ['short_term', 'medium_term', 'long_term'];
    const { data, error } = await this.client
      .from('stats_snapshots')
      .select('range')
      .eq('user_id', supabaseUserId)
      .eq('snapshot_date', getDailySnapshotDate())
      .in('range', requiredRanges);
    if (error) throw error;

    const completedRanges = new Set((data || []).map((snapshot: any) => snapshot.range));
    if (!requiredRanges.every(range => completedRanges.has(range))) return;

    const { error: markerError } = await this.client
      .from('users')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', supabaseUserId);
    if (markerError) throw markerError;
  }

  private getTrackArtistName(track: any): string {
    if (typeof track?.artist === 'string') return track.artist;
    if (typeof track?.artist?.name === 'string') return track.artist.name;
    if (typeof track?.artist_name === 'string') return track.artist_name;
    return track?.artists?.[0]?.name || '';
  }

}
