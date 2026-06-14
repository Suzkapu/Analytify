import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  public client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
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

  /** Ensures the public.users row exists for this auth user.
   *  If it was deleted manually, recreates it so FK constraints on
   *  user_cache / listening_history / stats_snapshots don't cause 409s. */
  async ensureUserProfile(
    supabaseUserId: string,
    spotifyId: string | null,
    displayName: string | null,
    profilePicUrl: string | null
  ): Promise<void> {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('id')
        .eq('id', supabaseUserId)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        console.log('[SupabaseService] User profile missing — recreating row for:', supabaseUserId);
        const { error: insertErr } = await this.client
          .from('users')
          .insert({
            id: supabaseUserId,
            spotify_id: spotifyId,
            display_name: displayName || 'Spotify User',
            profile_pic_url: profilePicUrl,
            backup_active: false
          });
        if (insertErr) {
          console.error('[SupabaseService] Failed to recreate user profile:', insertErr);
        } else {
          console.log('[SupabaseService] User profile recreated successfully.');
        }
      }
    } catch (e) {
      console.warn('[SupabaseService] ensureUserProfile error:', e);
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

  /** Syncs Spotify artists metadata into the database */
  async syncArtists(artists: any[]): Promise<void> {
    if (!artists || artists.length === 0) return;
    
    try {
      // Deduplicate by id to prevent PG 21000 "ON CONFLICT DO UPDATE cannot affect row a second time"
      const artistsMap = new Map<string, any>();
      artists.forEach(a => { if (a && a.id) artistsMap.set(a.id, a); });
      const uniqueArtists = Array.from(artistsMap.values());

      if (uniqueArtists.length === 0) return;

      const artistsToInsert = uniqueArtists.map(a => ({
        id: a.id,
        name: a.name,
        image_url: a.images?.[0]?.url || a.imageUrl || a.image_url || null,
        spotify_url: a.external_urls?.spotify || a.spotifyUrl || a.spotify_url || null,
        popularity: a.popularity || 0,
        followers_count: a.followers?.total || a.followersCount || a.followers_count || 0,
        last_updated: new Date().toISOString()
      }));

      const genresToInsert = new Set<string>();
      const artistGenresToInsert: any[] = [];

      uniqueArtists.forEach(a => {
        const genresList = a.genres || (a.genre ? [a.genre] : []);
        genresList.forEach((g: string) => {
          if (g) {
            genresToInsert.add(g);
            artistGenresToInsert.push({ artist_id: a.id, genre_name: g });
          }
        });
      });

      if (genresToInsert.size > 0) {
        const { error } = await this.client
          .from('genres')
          .upsert(Array.from(genresToInsert).map(name => ({ name })), { onConflict: 'name' });
        if (error) throw error;
      }

      if (artistsToInsert.length > 0) {
        const { error } = await this.client
          .from('artists')
          .upsert(artistsToInsert, { onConflict: 'id' });
        if (error) throw error;
      }

      if (artistGenresToInsert.length > 0) {
        const { error } = await this.client
          .from('artist_genres')
          .upsert(artistGenresToInsert, { onConflict: 'artist_id,genre_name' });
        if (error) throw error;
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing artists:', e);
    }
  }

  /** Syncs Spotify albums metadata into the database */
  async syncAlbums(albums: any[]): Promise<void> {
    if (!albums || albums.length === 0) return;

    try {
      // Deduplicate by id to prevent PG 21000 "ON CONFLICT DO UPDATE cannot affect row a second time"
      const albumsMap = new Map<string, any>();
      albums.forEach(a => { if (a && a.id) albumsMap.set(a.id, a); });
      const uniqueAlbums = Array.from(albumsMap.values());

      if (uniqueAlbums.length === 0) return;

      const albumsToInsert = uniqueAlbums.map(a => ({
        id: a.id,
        name: a.name,
        album_type: a.album_type || a.albumType || 'album',
        total_tracks: a.total_tracks || a.totalTracks || 1,
        release_date: (a.release_date && a.release_date.trim()) ? (a.release_date.length === 4 ? `${a.release_date}-01-01` : (a.release_date.length === 7 ? `${a.release_date}-01` : a.release_date)) : null,
        release_date_precision: a.release_date_precision || a.releaseDatePrecision || 'year',
        image_url: a.images?.[0]?.url || a.imageUrl || a.image_url || null,
        spotify_url: a.external_urls?.spotify || a.spotifyUrl || a.spotify_url || null,
        available_markets: a.available_markets || [],
        restriction_reason: a.restrictions?.reason || null,
        last_updated: new Date().toISOString()
      }));

      const albumArtistsToInsert: any[] = [];
      uniqueAlbums.forEach(a => {
        if (a.id && a.artists) {
          a.artists.forEach((art: any) => {
            if (art.id) {
              albumArtistsToInsert.push({ album_id: a.id, artist_id: art.id });
            }
          });
        }
      });

      if (albumsToInsert.length > 0) {
        const { error } = await this.client
          .from('albums')
          .upsert(albumsToInsert, { onConflict: 'id' });
        if (error) throw error;
      }

      if (albumArtistsToInsert.length > 0) {
        const { error } = await this.client
          .from('album_artists')
          .upsert(albumArtistsToInsert, { onConflict: 'album_id,artist_id' });
        if (error) throw error;
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing albums:', e);
    }
  }

  /** Syncs Spotify tracks metadata into the database */
  async syncTracks(tracks: any[]): Promise<void> {
    if (!tracks || tracks.length === 0) return;

    try {
      // Deduplicate by id to prevent PG 21000 "ON CONFLICT DO UPDATE cannot affect row a second time"
      const tracksMap = new Map<string, any>();
      tracks.forEach(t => { if (t && t.id) tracksMap.set(t.id, t); });
      const uniqueTracks = Array.from(tracksMap.values());

      if (uniqueTracks.length === 0) return;

      const tracksToInsert = uniqueTracks.map(t => ({
        id: t.id,
        name: t.name,
        album_id: t.album?.id || t.albumId || null,
        duration_ms: t.duration_ms || t.durationMs || 0,
        explicit: t.explicit || false,
        spotify_url: t.external_urls?.spotify || t.spotifyUrl || t.spotify_url || null,
        popularity: t.popularity || 0,
        track_number: t.track_number || t.trackNumber || 1,
        disc_number: t.disc_number || t.discNumber || 1,
        preview_url: t.preview_url || t.previewUrl || null,
        is_playable: t.is_playable !== false,
        is_local: t.is_local || false,
        isrc: t.external_ids?.isrc || null,
        available_markets: t.available_markets || [],
        restriction_reason: t.restrictions?.reason || null,
        last_updated: new Date().toISOString()
      }));

      const trackArtistsToInsert: any[] = [];
      uniqueTracks.forEach(t => {
        if (t.id && t.artists) {
          t.artists.forEach((art: any, rank: number) => {
            if (art.id) {
              trackArtistsToInsert.push({ track_id: t.id, artist_id: art.id, artist_rank: rank });
            }
          });
        }
      });

      if (tracksToInsert.length > 0) {
        const { error } = await this.client
          .from('tracks')
          .upsert(tracksToInsert, { onConflict: 'id' });
        if (error) throw error;
      }

      if (trackArtistsToInsert.length > 0) {
        const { error } = await this.client
          .from('track_artists')
          .upsert(trackArtistsToInsert, { onConflict: 'track_id,artist_id' });
        if (error) throw error;
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing tracks:', e);
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
            if (art && art.id) artistsMap.set(art.id, art);
          });
        }
      });
      // Collect album artists
      rawAlbums.forEach(al => {
        if (al.artists) {
          al.artists.forEach((art: any) => {
            if (art && art.id) artistsMap.set(art.id, art);
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
      const historyRows = items.map(item => ({
        user_id: supabaseUserId,
        track_id: item.track?.id || item.trackId,
        played_at: item.played_at
      })).filter(row => !!row.user_id && !!row.track_id && !!row.played_at);

      if (historyRows.length === 0) return;

      // 4. Insert listening history
      const { error } = await this.client
        .from('listening_history')
        .upsert(historyRows, { onConflict: 'user_id,played_at,track_id' });

      if (error) throw error;
      console.log(`[SupabaseService] Synced ${historyRows.length} history records to database.`);
    } catch (e) {
      console.error('[SupabaseService] Error syncing listening history:', e);
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
            id, name, duration_ms, explicit, spotify_url, popularity, preview_url,
            albums ( id, name, image_url ),
            track_artists (
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
        const artists = t.track_artists 
          ? t.track_artists.map((ta: any) => ({ id: ta.artists?.id, name: ta.artists?.name }))
          : [];

        return {
          played_at: row.played_at,
          track: {
            id: t.id,
            name: t.name,
            duration_ms: t.duration_ms,
            explicit: t.explicit,
            preview_url: t.preview_url,
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

  /** Checks if there is already a user stats snapshot for today in database */
  async hasStatsSnapshotForToday(supabaseUserId: string, range: string): Promise<boolean> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select('id')
        .eq('user_id', supabaseUserId)
        .eq('range', range)
        .eq('snapshot_date', todayStr)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0;
    } catch (e) {
      console.warn('[SupabaseService] Error checking today\'s stats snapshot:', e);
      return false;
    }
  }

  /** Loads today's stats snapshot from database */
  async loadTodayStatsSnapshot(supabaseUserId: string, range: string): Promise<any> {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select(`
          id, avg_popularity, explicit_percentage, genre_diversity,
          stats_snapshot_tracks (
            rank,
            tracks (
              id, name, duration_ms, explicit, spotify_url, popularity, preview_url,
              albums ( id, name, image_url ),
              track_artists (
                artists ( id, name )
              )
            )
          ),
          stats_snapshot_artists (
            rank,
            artists (
              id, name, image_url, spotify_url, popularity, followers_count
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
        .eq('snapshot_date', todayStr)
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
            popularity: t.popularity,
            preview_url: t.preview_url,
            external_urls: { spotify: t.spotify_url },
            spotifyUrl: t.spotify_url,
            // albumCover is the shortcut checked first by getTrackCover()
            albumCover: albumImageUrl,
            album: {
              id: t.albums?.id,
              name: t.albums?.name,
              images: albumImageUrl ? [{ url: albumImageUrl }] : []
            },
            artists: t.track_artists 
              ? t.track_artists.map((ta: any) => ({ id: ta.artists?.id, name: ta.artists?.name }))
              : []
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
            popularity: art.popularity,
            external_urls: { spotify: art.spotify_url },
            images: art.image_url ? [{ url: art.image_url }] : [],
            followers: { total: art.followers_count }
          };
        }).filter((a: any) => !!a);

      // Map genres
      const topGenres = (data.stats_snapshot_genres || [])
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => ({
          name: row.genre_name,
          count: row.weight,
          percentage: 0 // Will be calculated by UI
        }));

      return {
        avgPopularity: data.avg_popularity,
        explicitPercentage: data.explicit_percentage,
        genreDiversity: data.genre_diversity,
        topTracks,
        topArtists,
        topGenres
      };

    } catch (e) {
      console.error('[SupabaseService] Error loading stats snapshot from DB:', e);
      return null;
    }
  }

  /** Saves a user stats snapshot to database */
  async saveStatsSnapshot(
    supabaseUserId: string,
    range: string,
    avgPopularity: number,
    explicitPercentage: number,
    genreDiversity: number,
    topTracks: any[],
    topArtists: any[],
    topGenres: any[]
  ): Promise<void> {
    try {
      await this.ensureSession();

      const todayStr = new Date().toISOString().split('T')[0];

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
            if (art && art.id) artistsMap.set(art.id, art);
          });
        }
      });
      // Collect album artists
      rawAlbums.forEach(al => {
        if (al.artists) {
          al.artists.forEach((art: any) => {
            if (art && art.id) artistsMap.set(art.id, art);
          });
        }
      });
      const allArtists = Array.from(artistsMap.values());

      await this.syncArtists(allArtists);
      await this.syncAlbums(rawAlbums);
      await this.syncTracks(rawTracks);

      // 2. Create the snapshot row
      const { data: snapshot, error: snapshotErr } = await this.client
        .from('stats_snapshots')
        .upsert({
          user_id: supabaseUserId,
          range: range,
          snapshot_date: todayStr,
          avg_popularity: avgPopularity,
          explicit_percentage: explicitPercentage,
          genre_diversity: genreDiversity
        }, { onConflict: 'user_id,range,snapshot_date' })
        .select('id')
        .single();

      if (snapshotErr) throw snapshotErr;
      const snapshotId = snapshot.id;

      // 3. Link tracks
      const trackLinks = topTracks.map((t, idx) => ({
        snapshot_id: snapshotId,
        track_id: t.id,
        rank: idx + 1
      })).filter(row => !!row.track_id);

      if (trackLinks.length > 0) {
        const { error } = await this.client
          .from('stats_snapshot_tracks')
          .upsert(trackLinks, { onConflict: 'snapshot_id,rank' });
        if (error) throw error;
      }

      // 4. Link artists
      const artistLinks = topArtists.map((a, idx) => ({
        snapshot_id: snapshotId,
        artist_id: a.id,
        rank: idx + 1
      })).filter(row => !!row.artist_id);

      if (artistLinks.length > 0) {
        const { error } = await this.client
          .from('stats_snapshot_artists')
          .upsert(artistLinks, { onConflict: 'snapshot_id,rank' });
        if (error) throw error;
      }

      // 5. Link genres
      const genreLinks = topGenres.map((g, idx) => ({
        snapshot_id: snapshotId,
        genre_name: g.name,
        rank: idx + 1,
        weight: g.count || 0
      })).filter(row => !!row.genre_name);

      if (genreLinks.length > 0) {
        // Double check genres are in the genre table
        const { error: genreErr } = await this.client
          .from('genres')
          .upsert(genreLinks.map(gl => ({ name: gl.genre_name })), { onConflict: 'name' });
        if (genreErr) throw genreErr;

        const { error: linkErr } = await this.client
          .from('stats_snapshot_genres')
          .upsert(genreLinks, { onConflict: 'snapshot_id,rank' });
        if (linkErr) throw linkErr;
      }

      console.log(`[SupabaseService] Saved stats snapshot for today (${todayStr}, ${range}) to database.`);
    } catch (e) {
      console.error('[SupabaseService] Error saving stats snapshot to DB:', e);
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
    }
  }

  /** Loads all cached key-value pairs for the user from database */
  async loadUserCache(supabaseUserId: string): Promise<{ key: string; value: string }[]> {
    try {
      const { data, error } = await this.client
        .from('user_cache')
        .select('key, value')
        .eq('user_id', supabaseUserId);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[SupabaseService] Failed to load user cache from database:', e);
      return [];
    }
  }
}
