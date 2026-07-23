import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

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

function getDailyCutoffTimestamp(): string {
  return getDailyCutoff().toISOString();
}

function getDailySnapshotDate(): string {
  const cutoff = getDailyCutoff();
  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, '0');
  const day = String(cutoff.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
        .select('id, spotify_id, display_name, profile_pic_url')
        .eq('id', supabaseUserId)
        .maybeSingle();
      if (error) throw error;

      const isDev = !environment.production;
      const finalDisplayName = isDev && displayName && !displayName.startsWith('DEV ')
        ? `DEV ${displayName}`
        : (displayName || 'Spotify User');

      if (!data) {
        console.log('[SupabaseService] User profile missing — recreating row for:', supabaseUserId);
        const { error: insertErr } = await this.client
          .from('users')
          .insert({
            id: supabaseUserId,
            spotify_id: spotifyId,
            display_name: finalDisplayName,
            profile_pic_url: profilePicUrl,
            backup_active: false
          });
        if (insertErr) {
          // Check for unique constraint violation on spotify_id (e.g. 23505)
          if (insertErr.code === '23505' && spotifyId && spotifyId.endsWith('_dev')) {
            console.log('[SupabaseService] Unique constraint violation on spotify_id in dev mode. Attempting recovery...');
            const { data: conflictRow } = await this.client
              .from('users')
              .select('id')
              .eq('spotify_id', spotifyId)
              .maybeSingle();
            
            if (conflictRow && conflictRow.id !== supabaseUserId) {
              console.log(`[SupabaseService] Found contaminating row: ${conflictRow.id} with spotify_id: ${spotifyId}. Clearing it...`);
              await this.client
                .from('users')
                .update({ spotify_id: `${spotifyId}_old_${conflictRow.id}` })
                .eq('id', conflictRow.id);
              
              console.log('[SupabaseService] Retrying insert of dev user profile...');
              const { error: retryErr } = await this.client
                .from('users')
                .insert({
                  id: supabaseUserId,
                  spotify_id: spotifyId,
                  display_name: finalDisplayName,
                  profile_pic_url: profilePicUrl,
                  backup_active: false
                });
              if (retryErr) {
                console.error('[SupabaseService] Retry insert failed:', retryErr);
              }
            }
          } else {
            console.error('[SupabaseService] Failed to recreate user profile:', insertErr);
          }
        } else {
          console.log('[SupabaseService] User profile recreated successfully.');
        }
      } else {
        // If data exists, check if spotify_id, display_name, or profile_pic_url needs update
        const needsUpdate = 
          (spotifyId && data.spotify_id !== spotifyId) ||
          (finalDisplayName && data.display_name !== finalDisplayName) ||
          (profilePicUrl && data.profile_pic_url !== profilePicUrl);
        
        if (needsUpdate) {
          console.log('[SupabaseService] Updating existing user profile info for:', supabaseUserId);
          const { error: updateErr } = await this.client
            .from('users')
            .update({
              spotify_id: spotifyId || data.spotify_id,
              display_name: finalDisplayName || data.display_name,
              profile_pic_url: profilePicUrl || data.profile_pic_url
            })
            .eq('id', supabaseUserId);
          if (updateErr) {
            // Check for unique constraint violation on update
            if (updateErr.code === '23505' && spotifyId && spotifyId.endsWith('_dev')) {
              console.log('[SupabaseService] Unique constraint violation on spotify_id update in dev mode. Attempting recovery...');
              const { data: conflictRow } = await this.client
                .from('users')
                .select('id')
                .eq('spotify_id', spotifyId)
                .maybeSingle();
              
              if (conflictRow && conflictRow.id !== supabaseUserId) {
                console.log(`[SupabaseService] Found contaminating row: ${conflictRow.id} with spotify_id: ${spotifyId}. Clearing it...`);
                await this.client
                  .from('users')
                  .update({ spotify_id: `${spotifyId}_old_${conflictRow.id}` })
                  .eq('id', conflictRow.id);
                
                console.log('[SupabaseService] Retrying update of dev user profile...');
                const { error: retryErr } = await this.client
                  .from('users')
                  .update({
                    spotify_id: spotifyId,
                    display_name: finalDisplayName
                  })
                  .eq('id', supabaseUserId);
                if (retryErr) {
                  console.error('[SupabaseService] Retry update failed:', retryErr);
                }
              }
            } else {
              console.error('[SupabaseService] Failed to update user profile:', updateErr);
            }
          } else {
            console.log('[SupabaseService] User profile updated successfully.');
          }
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

  /** Deletes all synced data connected to this profile from the database.
   *  Because of ON DELETE CASCADE constraints, deleting the row in the
   *  'users' table automatically erases user_cache, listening_history,
   *  stats_snapshots, and top items history, while keeping shared tracks/artists. */
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
        .select('id, name, image_url, spotify_url, popularity, followers_count')
        .in('id', artistIds);
      if (existingArtistsError) throw existingArtistsError;
      const existingArtistMap = new Map<string, any>(
        (existingArtists || []).map((artist: any) => [artist.id, artist])
      );

      if (onlyInsertMissing) {
        uniqueArtists = uniqueArtists.filter(a => {
          const existing = existingArtistMap.get(a.id);
          return !existing || (existing.popularity === 0 && existing.followers_count === 0);
        });
        if (uniqueArtists.length === 0) return;
      }

      const rawImageUrls = new Map<string, string | null>(uniqueArtists.map(a => [
        a.id,
        a.images?.[0]?.url || a.imageUrl || a.image_url || null
      ]));

      const artistsToInsert = uniqueArtists.map(a => {
        const existing = existingArtistMap.get(a.id);
        const incomingImage = rawImageUrls.get(a.id);
        const incomingFollowers = a.followers?.total ?? a.followersCount ?? a.followers_count;
        return {
          id: a.id,
          name: a.name || existing?.name || 'Unknown Artist',
          image_url: this.isPlaceholderImage(incomingImage)
            ? (existing?.image_url || null)
            : incomingImage,
          spotify_url: a.external_urls?.spotify || a.spotifyUrl || a.spotify_url || existing?.spotify_url || null,
          popularity: Number.isFinite(a.popularity) ? a.popularity : (existing?.popularity ?? 0),
          followers_count: Number.isFinite(incomingFollowers)
            ? incomingFollowers
            : (existing?.followers_count ?? 0),
          last_updated: new Date().toISOString()
        };
      });

      const genresToInsert = new Set<string>();
      const artistGenresToInsert: any[] = [];
      const artistsWithAuthoritativeGenres: string[] = [];

      uniqueArtists.forEach(a => {
        const hasSpotifyGenres = Array.isArray(a.genres);
        const genresList = (hasSpotifyGenres ? a.genres : (a.genre ? [a.genre] : [])).filter(
          (g: string) => g && g.trim().toLowerCase() !== 'artist'
        );
        if (hasSpotifyGenres) {
          artistsWithAuthoritativeGenres.push(a.id);
        }
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

      // A full Spotify artist response contains an authoritative genres array.
      // Replace that artist's links so genres removed or corrected by Spotify
      // cannot remain attached forever.
      if (artistsWithAuthoritativeGenres.length > 0) {
        const { error } = await this.client
          .from('artist_genres')
          .delete()
          .in('artist_id', artistsWithAuthoritativeGenres);
        if (error) throw error;
      }

      if (artistGenresToInsert.length > 0) {
        const { error } = await this.client
          .from('artist_genres')
          .upsert(artistGenresToInsert, { onConflict: 'artist_id,genre_name' });
        if (error) throw error;
      }

      if (artistsToInsert.length > 0) {
        const recordedAt = getDailyCutoffTimestamp();
        const currentArtistIds = new Set(
          uniqueArtists
            .filter(a => Number.isFinite(a.popularity) && Number.isFinite(a.followers?.total ?? a.followersCount ?? a.followers_count))
            .map(a => a.id)
        );
        const popHistory = artistsToInsert
          .filter(a => currentArtistIds.has(a.id))
          .map(a => ({
            artist_id: a.id,
            recorded_at: recordedAt,
            popularity: a.popularity,
            followers_count: a.followers_count
          }));
        if (popHistory.length > 0) {
          const { error: popErr } = await this.client
            .from('artist_popularity_history')
            .upsert(popHistory, { onConflict: 'artist_id,recorded_at' });
          if (popErr) throw popErr;
        }
      }
    } catch (e) {
      console.error('[SupabaseService] Error syncing artists:', e);
      throw e;
    }
  }

  /** Looks up genres for a list of artist IDs from the artist_genres table */
  async lookupArtistGenres(artistIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (!artistIds || artistIds.length === 0) return result;

    try {
      const { data, error } = await this.client
        .from('artist_genres')
        .select('artist_id, genre_name')
        .in('artist_id', artistIds);

      if (error) throw error;
      if (data) {
        data.forEach((row: any) => {
          const existing = result.get(row.artist_id) || [];
          existing.push(row.genre_name);
          result.set(row.artist_id, existing);
        });
      }
    } catch (e) {
      console.warn('[SupabaseService] Error looking up artist genres:', e);
    }
    return result;
  }

  /** Loads a normalized artist profile before a direct Spotify lookup. */
  async loadArtistById(artistId: string): Promise<any | null> {
    if (!artistId) return null;
    try {
      const { data, error } = await this.client
        .from('artists')
        .select(`
          id, name, image_url, spotify_url, popularity, followers_count,
          artist_genres ( genre_name )
        `)
        .eq('id', artistId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        images: data.image_url ? [{ url: data.image_url }] : [],
        external_urls: { spotify: data.spotify_url },
        popularity: data.popularity,
        followers: { total: data.followers_count },
        genres: data.artist_genres
          ? data.artist_genres.map((row: any) => row.genre_name)
          : []
      };
    } catch (e) {
      console.warn('[SupabaseService] Failed to load artist:', e);
      return null;
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
        .select('*')
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
          spotify_url: a.external_urls?.spotify || a.spotifyUrl || a.spotify_url || existing?.spotify_url || null,
          available_markets: Array.isArray(a.available_markets)
            ? a.available_markets
            : (existing?.available_markets || []),
          restriction_reason: a.restrictions?.reason || existing?.restriction_reason || null,
          label: a.label ?? existing?.label ?? null,
          popularity: Number.isFinite(a.popularity) ? a.popularity : (existing?.popularity ?? 0),
          upc: a.external_ids?.upc || a.upc || existing?.upc || null,
          ean: a.external_ids?.ean || a.ean || existing?.ean || null,
          last_updated: new Date().toISOString()
        };
      });

      const albumArtistsToInsert: any[] = [];
      const relationshipAlbumIds: string[] = [];
      uniqueAlbums.forEach(a => {
        if (a.id && Array.isArray(a.artists)) {
          relationshipAlbumIds.push(a.id);
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
              popularity: 0,
              followers_count: 0,
              last_updated: new Date().toISOString()
            };
          });

          const { error: artErr } = await this.client
            .from('artists')
            .upsert(artistPlaceholders, { onConflict: 'id' });
          if (artErr) throw artErr;
        }
      }

      if (albumsToInsert.length > 0) {
        const { error } = await this.client
          .from('albums')
          .upsert(albumsToInsert, { onConflict: 'id' });
        if (error) throw error;
      }

      // Sync Album Copyrights
      const albumCopyrightsToInsert: any[] = [];
      const copyrightAlbumIds: string[] = [];
      uniqueAlbums.forEach(a => {
        if (a.id && Array.isArray(a.copyrights)) {
          copyrightAlbumIds.push(a.id);
          a.copyrights.forEach((copy: any) => {
            if (copy.text && (copy.type === 'C' || copy.type === 'P')) {
              albumCopyrightsToInsert.push({
                album_id: a.id,
                text: copy.text,
                type: copy.type
              });
            }
          });
        }
      });

      if (copyrightAlbumIds.length > 0) {
        const { error: deleteErr } = await this.client
          .from('album_copyrights')
          .delete()
          .in('album_id', Array.from(new Set(copyrightAlbumIds)));
        if (deleteErr) throw deleteErr;
      }

      if (albumCopyrightsToInsert.length > 0) {
        const { error: copyrightErr } = await this.client
          .from('album_copyrights')
          .insert(albumCopyrightsToInsert);
        if (copyrightErr) throw copyrightErr;
      }

      // Sync Album Popularity History
      if (albumsToInsert.length > 0) {
        const recordedAt = getDailyCutoffTimestamp();
        const currentAlbumIds = new Set(
          uniqueAlbums.filter(a => Number.isFinite(a.popularity)).map(a => a.id)
        );
        const popHistory = albumsToInsert
          .filter(a => currentAlbumIds.has(a.id))
          .map(a => ({
            album_id: a.id,
            recorded_at: recordedAt,
            popularity: a.popularity
          }));
        if (popHistory.length > 0) {
          const { error: popErr } = await this.client
            .from('album_popularity_history')
            .upsert(popHistory, { onConflict: 'album_id,recorded_at' });
          if (popErr) throw popErr;
        }
      }

      if (relationshipAlbumIds.length > 0) {
        const { error: clearErr } = await this.client
          .from('album_artists')
          .delete()
          .in('album_id', Array.from(new Set(relationshipAlbumIds)));
        if (clearErr) throw clearErr;
      }

      if (albumArtistsToInsert.length > 0) {
        const { error } = await this.client
          .from('album_artists')
          .upsert(albumArtistsToInsert, { onConflict: 'album_id,artist_id' });
        if (error) throw error;
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
        .select('*')
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

          const { error: albErr } = await this.client
            .from('albums')
            .upsert(albumPlaceholderToInsert, { onConflict: 'id' });
          if (albErr) throw albErr;
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
              popularity: 0,
              followers_count: 0,
              last_updated: new Date().toISOString()
            };
          });

          const { error: artErr } = await this.client
            .from('artists')
            .upsert(artistPlaceholders, { onConflict: 'id' });
          if (artErr) throw artErr;
        }
      }

      // Extract all unique linked_from ids to protect self-referential track FKs
      const linkedFromTrackIds = new Set<string>();
      uniqueTracks.forEach(t => {
        const linkedId = t.linked_from?.id || t.linkedFromTrackId;
        if (linkedId) {
          linkedFromTrackIds.add(linkedId);
        }
      });

      if (linkedFromTrackIds.size > 0) {
        const { data: existingLinked, error: existingLinkedError } = await this.client
          .from('tracks')
          .select('id')
          .in('id', Array.from(linkedFromTrackIds));
        if (existingLinkedError) throw existingLinkedError;
        const existingLinkedIds = new Set(existingLinked ? existingLinked.map(e => e.id) : []);
        const missingLinkedIds = Array.from(linkedFromTrackIds).filter(id => !existingLinkedIds.has(id));

        if (missingLinkedIds.length > 0) {
          const stubs = missingLinkedIds.map(id => ({
            id: id,
            name: 'Linked Track Placeholder',
            duration_ms: 0,
            explicit: false,
            popularity: 0,
            track_number: 1,
            disc_number: 1,
            is_playable: true,
            is_local: false,
            last_updated: new Date().toISOString()
          }));
          const { error: stubErr } = await this.client
            .from('tracks')
            .upsert(stubs, { onConflict: 'id' });
          if (stubErr) throw stubErr;
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
          spotify_url: t.external_urls?.spotify || t.spotifyUrl || t.spotify_url || existing?.spotify_url || null,
          popularity: Number.isFinite(t.popularity) ? t.popularity : (existing?.popularity ?? 0),
          track_number: Number.isFinite(trackNumber) ? trackNumber : (existing?.track_number ?? 1),
          disc_number: Number.isFinite(discNumber) ? discNumber : (existing?.disc_number ?? 1),
          preview_url: t.preview_url ?? t.previewUrl ?? existing?.preview_url ?? null,
          is_playable: typeof t.is_playable === 'boolean' ? t.is_playable : (existing?.is_playable ?? true),
          is_local: typeof t.is_local === 'boolean' ? t.is_local : (existing?.is_local ?? false),
          isrc: t.external_ids?.isrc || existing?.isrc || null,
          available_markets: Array.isArray(t.available_markets)
            ? t.available_markets
            : (existing?.available_markets || []),
          restriction_reason: t.restrictions?.reason || existing?.restriction_reason || null,
          linked_from_track_id: t.linked_from?.id || t.linkedFromTrackId || existing?.linked_from_track_id || null,
          last_updated: new Date().toISOString()
        };
      });

      const trackArtistsToInsert: any[] = [];
      const relationshipTrackIds: string[] = [];
      uniqueTracks.forEach(t => {
        if (t.id && Array.isArray(t.artists)) {
          relationshipTrackIds.push(t.id);
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

      // Sync Track Popularity History
      if (tracksToInsert.length > 0) {
        const recordedAt = getDailyCutoffTimestamp();
        const currentTrackIds = new Set(
          uniqueTracks.filter(t => Number.isFinite(t.popularity)).map(t => t.id)
        );
        const popHistory = tracksToInsert
          .filter(t => currentTrackIds.has(t.id))
          .map(t => ({
            track_id: t.id,
            recorded_at: recordedAt,
            popularity: t.popularity
          }));
        if (popHistory.length > 0) {
          const { error: popErr } = await this.client
            .from('track_popularity_history')
            .upsert(popHistory, { onConflict: 'track_id,recorded_at' });
          if (popErr) throw popErr;
        }
      }

      if (relationshipTrackIds.length > 0) {
        const { error: clearErr } = await this.client
          .from('track_artists')
          .delete()
          .in('track_id', Array.from(new Set(relationshipTrackIds)));
        if (clearErr) throw clearErr;
      }

      if (trackArtistsToInsert.length > 0) {
        const { error } = await this.client
          .from('track_artists')
          .upsert(trackArtistsToInsert, { onConflict: 'track_id,artist_id' });
        if (error) throw error;
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
            popularity: t.popularity,
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
      const todayStr = getDailySnapshotDate();
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
      const todayStr = getDailySnapshotDate();
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
              id, name, image_url, spotify_url, popularity, followers_count,
              artist_genres ( genre_name )
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
            followers: { total: art.followers_count },
            genres: art.artist_genres ? art.artist_genres.map((ag: any) => ag.genre_name) : []
          };
        }).filter((a: any) => !!a);

      // Map genres
      const rawGenres = data.stats_snapshot_genres || [];
      const sumOfWeights = rawGenres.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
      const useWeightAsPercentage = sumOfWeights <= 100 && rawGenres.every((r: any) => (r.weight || 0) <= 100);
      const topGenres = rawGenres
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => ({
          name: row.genre_name,
          count: row.weight,
          percentage: useWeightAsPercentage 
            ? row.weight 
            : (sumOfWeights > 0 ? Math.min(100, Math.round((row.weight / sumOfWeights) * 100)) : 0)
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

  /** Loads all stats snapshots for a user from database for a specific range */
  async loadAllStatsSnapshots(supabaseUserId: string, range: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select(`
          id, avg_popularity, explicit_percentage, genre_diversity, created_at, snapshot_date,
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
              id, name, image_url, spotify_url, popularity, followers_count,
              artist_genres ( genre_name )
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
              popularity: t.popularity,
              preview_url: t.preview_url,
              external_urls: { spotify: t.spotify_url },
              spotifyUrl: t.spotify_url,
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
        const topArtists = (row.stats_snapshot_artists || [])
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((subRow: any) => {
            const art = subRow.artists;
            if (!art) return null;
            return {
              id: art.id,
              name: art.name,
              popularity: art.popularity,
              external_urls: { spotify: art.spotify_url },
              images: art.image_url ? [{ url: art.image_url }] : [],
              followers: { total: art.followers_count },
              genres: art.artist_genres ? art.artist_genres.map((ag: any) => ag.genre_name) : []
            };
          }).filter((a: any) => !!a);

        // Map genres
        const rawGenres = row.stats_snapshot_genres || [];
        const sumOfWeights = rawGenres.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
        const useWeightAsPercentage = sumOfWeights <= 100 && rawGenres.every((r: any) => (r.weight || 0) <= 100);
        const topGenres = rawGenres
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((subRow: any) => ({
            name: subRow.genre_name,
            count: subRow.weight,
            percentage: useWeightAsPercentage 
              ? subRow.weight 
              : (sumOfWeights > 0 ? Math.min(100, Math.round((subRow.weight / sumOfWeights) * 100)) : 0)
          }));

        return {
          userId: supabaseUserId,
          range: range,
          timestamp: parseSnapshotTimestamp(row.snapshot_date, row.created_at),
          snapshotDate: row.snapshot_date,
          avgPopularity: Number(row.avg_popularity),
          explicitPercentage: Number(row.explicit_percentage),
          genreDiversity: row.genre_diversity,
          topTracks,
          topArtists,
          topGenres
        };
      });
    } catch (e) {
      console.error('[SupabaseService] Error loading all stats snapshots from DB:', e);
      return [];
    }
  }

  /** Loads all stats snapshots metadata (without tracks/artists/genres joins) for performance */
  async loadAllStatsSnapshotsMetadata(supabaseUserId: string, range: string): Promise<any[]> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select('id, avg_popularity, explicit_percentage, genre_diversity, created_at, snapshot_date')
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
        avgPopularity: Number(row.avg_popularity),
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

  /** Loads full details for a single stats snapshot by ID */
  async loadStatsSnapshotById(supabaseUserId: string, snapshotId: string): Promise<any | null> {
    try {
      const { data, error } = await this.client
        .from('stats_snapshots')
        .select(`
          id, avg_popularity, explicit_percentage, genre_diversity, created_at, snapshot_date, range,
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
              id, name, image_url, spotify_url, popularity, followers_count,
              artist_genres ( genre_name )
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
            popularity: t.popularity,
            preview_url: t.preview_url,
            external_urls: { spotify: t.spotify_url },
            spotifyUrl: t.spotify_url,
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
            followers: { total: art.followers_count },
            genres: art.artist_genres ? art.artist_genres.map((ag: any) => ag.genre_name) : []
          };
        }).filter((a: any) => !!a);

      // Map genres
      const rawGenres = data.stats_snapshot_genres || [];
      const sumOfWeights = rawGenres.reduce((sum: number, r: any) => sum + (r.weight || 0), 0);
      const useWeightAsPercentage = sumOfWeights <= 100 && rawGenres.every((r: any) => (r.weight || 0) <= 100);
      const topGenres = rawGenres
        .sort((a: any, b: any) => a.rank - b.rank)
        .map((row: any) => ({
          name: row.genre_name,
          count: row.weight,
          percentage: useWeightAsPercentage 
            ? row.weight 
            : (sumOfWeights > 0 ? Math.min(100, Math.round((row.weight / sumOfWeights) * 100)) : 0)
        }));

      return {
        id: data.id,
        userId: supabaseUserId,
        range: data.range,
        timestamp: parseSnapshotTimestamp(data.snapshot_date, data.created_at),
        snapshotDate: data.snapshot_date,
        avgPopularity: Number(data.avg_popularity),
        explicitPercentage: Number(data.explicit_percentage),
        genreDiversity: data.genre_diversity,
        topTracks,
        topArtists,
        topGenres,
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
    avgPopularity: number,
    explicitPercentage: number,
    genreDiversity: number,
    topTracks: any[],
    topArtists: any[],
    topGenres: any[],
    onlyInsertMissing = false,
    customDateStr?: string
  ): Promise<void> {
    try {
      await this.ensureSession();

      const todayStr = customDateStr || getDailySnapshotDate();
      const fetchedAt = customDateStr
        ? new Date(`${customDateStr}T01:00:00`).toISOString()
        : getDailyCutoffTimestamp();

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

      // Rewriting the same daily snapshot must replace its ranks. Otherwise
      // shorter lists leave stale rows and moved items can violate the
      // per-snapshot unique constraints.
      for (const table of [
        'stats_snapshot_tracks',
        'stats_snapshot_artists',
        'stats_snapshot_genres'
      ]) {
        const { error } = await this.client
          .from(table)
          .delete()
          .eq('snapshot_id', snapshotId);
        if (error) throw error;
      }

      // 3. Link tracks
      const seenTrackIds = new Set<string>();
      const trackLinks: any[] = [];
      topTracks.forEach(track => {
        if (track?.id && !seenTrackIds.has(track.id)) {
          seenTrackIds.add(track.id);
          trackLinks.push({
            snapshot_id: snapshotId,
            track_id: track.id,
            rank: trackLinks.length + 1
          });
        }
      });

      if (trackLinks.length > 0) {
        const { error } = await this.client
          .from('stats_snapshot_tracks')
          .upsert(trackLinks, { onConflict: 'snapshot_id,rank' });
        if (error) throw error;
      }

      // 4. Link artists
      const seenArtistIds = new Set<string>();
      const artistLinks: any[] = [];
      topArtists.forEach(artist => {
        if (artist?.id && !seenArtistIds.has(artist.id)) {
          seenArtistIds.add(artist.id);
          artistLinks.push({
            snapshot_id: snapshotId,
            artist_id: artist.id,
            rank: artistLinks.length + 1
          });
        }
      });

      if (artistLinks.length > 0) {
        const { error } = await this.client
          .from('stats_snapshot_artists')
          .upsert(artistLinks, { onConflict: 'snapshot_id,rank' });
        if (error) throw error;
      }

      // 5. Link genres
      const seenGenres = new Set<string>();
      const genreLinks: any[] = [];
      topGenres.forEach(genre => {
        if (genre?.name && !seenGenres.has(genre.name)) {
          seenGenres.add(genre.name);
          genreLinks.push({
            snapshot_id: snapshotId,
            genre_name: genre.name,
            rank: genreLinks.length + 1,
            weight: typeof genre.percentage === 'number' ? genre.percentage : (genre.count || 0)
          });
        }
      });

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

      // Raw top-item history represents one replaceable daily rank list too.
      // Clearing first prevents stale trailing ranks after a shorter retry.
      for (const table of ['user_top_tracks_history', 'user_top_artists_history']) {
        const { error } = await this.client
          .from(table)
          .delete()
          .eq('user_id', supabaseUserId)
          .eq('time_range', range)
          .eq('fetched_at', fetchedAt);
        if (error) throw error;
      }

      // 6. Save raw top items history to user_top_tracks_history
      if (trackLinks.length > 0) {
        const topTracksHistory = trackLinks.map(link => ({
          user_id: supabaseUserId,
          time_range: range,
          rank: link.rank,
          track_id: link.track_id,
          fetched_at: fetchedAt
        }));

        if (topTracksHistory.length > 0) {
          const { error } = await this.client
            .from('user_top_tracks_history')
            .upsert(topTracksHistory, { onConflict: 'user_id,time_range,fetched_at,rank' });
          if (error) throw error;
        }
      }

      // 7. Save raw top items history to user_top_artists_history
      if (artistLinks.length > 0) {
        const topArtistsHistory = artistLinks.map(link => ({
          user_id: supabaseUserId,
          time_range: range,
          rank: link.rank,
          artist_id: link.artist_id,
          fetched_at: fetchedAt
        }));

        if (topArtistsHistory.length > 0) {
          const { error } = await this.client
            .from('user_top_artists_history')
            .upsert(topArtistsHistory, { onConflict: 'user_id,time_range,fetched_at,rank' });
          if (error) throw error;
        }
      }

      // last_synced_at is deliberately not a generic activity timestamp.
      // It advances only when all three current daily stats snapshots exist.
      if (!customDateStr) {
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
      console.error('[SupabaseService] Failed to load user cache from database:', e);
      return [];
    }
  }

  /** Syncs track audio features into the database */
  async syncTrackAudioFeatures(features: any[]): Promise<void> {
    if (!features || features.length === 0) return;
    try {
      // Filter out null/invalid features
      const validFeatures = features.filter(f => f && f.id);
      if (validFeatures.length === 0) return;

      // Ensure all referenced track IDs exist in the tracks table to avoid FK violations.
      // If any tracks are missing, they should have placeholder rows created.
      const trackIds = Array.from(new Set(validFeatures.map(f => f.id)));
      const { data: existingTracks, error: existingTracksError } = await this.client
        .from('tracks')
        .select('id')
        .in('id', trackIds);
      if (existingTracksError) throw existingTracksError;
      const existingTrackIds = new Set(existingTracks ? existingTracks.map(t => t.id) : []);
      const missingTrackIds = trackIds.filter(id => !existingTrackIds.has(id));

      if (missingTrackIds.length > 0) {
        const trackPlaceholders = missingTrackIds.map(id => ({
          id: id,
          name: 'Track Placeholder (Audio Features)',
          duration_ms: 0,
          explicit: false,
          popularity: 0,
          track_number: 1,
          disc_number: 1,
          is_playable: true,
          is_local: false,
          last_updated: new Date().toISOString()
        }));
        const { error: stubErr } = await this.client
          .from('tracks')
          .upsert(trackPlaceholders, { onConflict: 'id' });
        if (stubErr) throw stubErr;
      }

      const rows = validFeatures.map(f => ({
        track_id: f.id,
        danceability: f.danceability || 0,
        energy: f.energy || 0,
        key: f.key || 0,
        loudness: f.loudness || 0,
        mode: f.mode || 0,
        speechiness: f.speechiness || 0,
        acousticness: f.acousticness || 0,
        instrumentalness: f.instrumentalness || 0,
        liveness: f.liveness || 0,
        valence: f.valence || 0,
        tempo: f.tempo || 0,
        time_signature: f.time_signature || 0,
        last_updated: new Date().toISOString()
      }));

      const { error } = await this.client
        .from('track_audio_features')
        .upsert(rows, { onConflict: 'track_id' });
      if (error) throw error;
      console.log(`[SupabaseService] Synced ${rows.length} track audio features.`);
    } catch (e) {
      console.error('[SupabaseService] Error syncing track audio features:', e);
      throw e;
    }
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

}
