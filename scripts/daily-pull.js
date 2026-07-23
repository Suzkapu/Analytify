/**
 * Analytify - Automated Daily Spotify Pull Script
 * 
 * This script runs in the background (e.g. via Linux cronjob or as a daemon)
 * to pull recent listening history plus daily top-item snapshots for all
 * registered users and store them in the normalized Supabase database.
 * 
 * Required Environment Variables:
 * - SUPABASE_URL: The URL of your Supabase project
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key to bypass RLS policies and sync data
 * - SPOTIFY_CLIENT_ID: Your Spotify Developer Client ID
 * - SPOTIFY_CLIENT_SECRET: Your Spotify Developer Client Secret
 * - DAILY_PULL_SPOTIFY_IDS: Comma-separated Spotify user IDs allowed to use this private job
 * - DAILY_TIME_ZONE: Optional IANA timezone for the 01:00 cutoff (default: Europe/Vienna)
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Keep the daily 01:00 boundary deterministic even when cron runs on a UTC host.
process.env.TZ = process.env.DAILY_TIME_ZONE || 'Europe/Vienna';

const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  dailyPullSpotifyIds: (process.env.DAILY_PULL_SPOTIFY_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
};

if (!CONFIG.supabaseServiceRoleKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY env variable is required.');
  process.exit(1);
}
if (!CONFIG.spotifyClientId) {
  console.error('CRITICAL: SPOTIFY_CLIENT_ID env variable is required.');
  process.exit(1);
}
if (!CONFIG.spotifyClientSecret) {
  console.error('CRITICAL: SPOTIFY_CLIENT_SECRET env variable is required.');
  process.exit(1);
}
if (CONFIG.dailyPullSpotifyIds.length === 0) {
  console.error('CRITICAL: DAILY_PULL_SPOTIFY_IDS must contain at least one explicitly allowed Spotify user ID.');
  process.exit(1);
}

// Initialize Supabase Admin client (ws transport required for Node.js < 22)
const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    transport: ws
  }
});

// Helper for HTTP requests using Node.js native fetch
async function apiRequest(url, options = {}, retryCount = 0) {
  if (url.startsWith('https://api.spotify.com/v1')) {
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['Accept-Language'] = 'en-GB,en-US;q=0.9,en;q=0.8';
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 429 && retryCount < 3) {
      const retryAfterSeconds = Math.max(1, Number(response.headers.get('retry-after')) || 1);
      console.warn(`[Spotify] Rate limited. Retrying in ${retryAfterSeconds}s (${retryCount + 1}/3).`);
      await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
      return apiRequest(url, options, retryCount + 1);
    }
    const errorText = await response.text();
    const error = new Error(`HTTP Error ${response.status} at ${url}: ${errorText}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Helper to batch items into chunks
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function getDailyCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(1, 0, 0, 0);
  if (now.getTime() < cutoff.getTime()) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
}

function getDailyCutoffTimestamp() {
  return getDailyCutoff().toISOString();
}

function getDailySnapshotDate() {
  const cutoff = getDailyCutoff();
  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, '0');
  const day = String(cutoff.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 1. Get Spotify Access Token using Refresh Token
async function getSpotifyAccessToken(refreshToken) {
  const url = 'https://accounts.spotify.com/api/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CONFIG.spotifyClientId,
    client_secret: CONFIG.spotifyClientSecret
  });

  const data = await apiRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  return data.access_token;
}

// 2. Sync Artists
async function syncArtists(spotifyAccessToken, artistIds, pulledArtists = []) {
  const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { data: existingArtists, error: existingArtistsError } = await supabase
    .from('artists')
    .select('id, name, image_url, spotify_url, popularity, followers_count')
    .in('id', uniqueIds);
  if (existingArtistsError) throw existingArtistsError;
  const existingMap = new Map((existingArtists || []).map(artist => [artist.id, artist]));

  const pulledMap = new Map();
  pulledArtists.forEach(artist => {
    if (artist?.id && uniqueIds.includes(artist.id)) pulledMap.set(artist.id, artist);
  });

  const idsToFetch = uniqueIds.filter(id => {
    if (pulledMap.has(id)) return false;
    const existing = existingMap.get(id);
    return !existing || (!existing.image_url && !existing.popularity && !existing.followers_count);
  });

  const artistObjects = Array.from(pulledMap.values());
  for (const chunk of chunkArray(idsToFetch, 50)) {
    try {
      const data = await apiRequest(`https://api.spotify.com/v1/artists?ids=${chunk.join(',')}&locale=en_US`, {
        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
      });
      artistObjects.push(...(data.artists || []).filter(Boolean));
    } catch (batchError) {
      if (![400, 403, 404].includes(batchError.status)) throw batchError;
      // 2026 Development Mode removed batch catalog endpoints. Fall back to
      // individual requests while retaining batch support for extended quota.
      console.warn(`Artist batch lookup failed; using individual requests: ${batchError.message}`);
      for (const id of chunk) {
        try {
          artistObjects.push(await apiRequest(`https://api.spotify.com/v1/artists/${id}?locale=en_US`, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
          }));
        } catch (error) {
          console.warn(`Failed to fetch artist ${id}: ${error.message}`);
        }
      }
    }
  }

  const deduplicated = new Map();
  artistObjects.forEach(artist => {
    if (artist?.id) deduplicated.set(artist.id, artist);
  });
  if (deduplicated.size === 0) return;

  const genresToInsert = new Set();
  const artistGenresToInsert = [];
  const artistsWithAuthoritativeGenres = [];
  const artistsToInsert = Array.from(deduplicated.values()).map(artist => {
    const existing = existingMap.get(artist.id);
    if (Array.isArray(artist.genres)) {
      artistsWithAuthoritativeGenres.push(artist.id);
    }
    (Array.isArray(artist.genres) ? artist.genres : []).forEach(genre => {
      if (genre && genre.trim().toLowerCase() !== 'artist') {
        genresToInsert.add(genre);
        artistGenresToInsert.push({ artist_id: artist.id, genre_name: genre });
      }
    });

    return {
      id: artist.id,
      name: artist.name || existing?.name || 'Unknown Artist',
      image_url: artist.images?.[0]?.url || existing?.image_url || null,
      spotify_url: artist.external_urls?.spotify || existing?.spotify_url || null,
      popularity: Number.isFinite(artist.popularity) ? artist.popularity : (existing?.popularity || 0),
      followers_count: Number.isFinite(artist.followers?.total)
        ? artist.followers.total
        : (existing?.followers_count || 0),
      last_updated: new Date().toISOString()
    };
  });

  if (genresToInsert.size > 0) {
    const { error } = await supabase
      .from('genres')
      .upsert(Array.from(genresToInsert).map(name => ({ name })), { onConflict: 'name' });
    if (error) throw error;
  }

  const { error: artistError } = await supabase
    .from('artists')
    .upsert(artistsToInsert, { onConflict: 'id' });
  if (artistError) throw artistError;

  if (artistsWithAuthoritativeGenres.length > 0) {
    const { error } = await supabase
      .from('artist_genres')
      .delete()
      .in('artist_id', artistsWithAuthoritativeGenres);
    if (error) throw error;
  }

  if (artistGenresToInsert.length > 0) {
    const { error } = await supabase
      .from('artist_genres')
      .upsert(artistGenresToInsert, { onConflict: 'artist_id,genre_name' });
    if (error) throw error;
  }
}

function normalizeReleaseDate(value) {
  if (!value) return null;
  if (value.length === 4) return `${value}-01-01`;
  if (value.length === 7) return `${value}-01`;
  return value;
}

// 3. Sync Albums
async function syncAlbums(spotifyAccessToken, albumIds, pulledAlbums = []) {
  const uniqueIds = Array.from(new Set(albumIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { data: existingAlbums, error: existingAlbumsError } = await supabase
    .from('albums')
    .select('*')
    .in('id', uniqueIds);
  if (existingAlbumsError) throw existingAlbumsError;
  const existingMap = new Map((existingAlbums || []).map(album => [album.id, album]));
  const missingIds = uniqueIds.filter(id => !existingMap.has(id));

  const albumMap = new Map();
  pulledAlbums.forEach(album => {
    if (album?.id && uniqueIds.includes(album.id)) albumMap.set(album.id, album);
  });

  for (const chunk of chunkArray(missingIds, 20)) {
    try {
      const data = await apiRequest(`https://api.spotify.com/v1/albums?ids=${chunk.join(',')}`, {
        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
      });
      (data.albums || []).filter(Boolean).forEach(album => albumMap.set(album.id, album));
    } catch (batchError) {
      if (![400, 403, 404].includes(batchError.status)) throw batchError;
      console.warn(`Album batch lookup failed; using individual requests: ${batchError.message}`);
      for (const id of chunk) {
        try {
          const album = await apiRequest(`https://api.spotify.com/v1/albums/${id}`, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
          });
          albumMap.set(album.id, album);
        } catch (error) {
          console.warn(`Failed to fetch album ${id}: ${error.message}`);
        }
      }
    }
  }

  if (albumMap.size === 0) return;

  const albumsToInsert = [];
  const albumArtistsToInsert = [];
  const albumCopyrightsToInsert = [];
  const relationshipAlbumIds = [];
  const copyrightAlbumIds = [];

  for (const album of albumMap.values()) {
    const existing = existingMap.get(album.id);
    albumsToInsert.push({
      id: album.id,
      name: album.name || existing?.name || 'Unknown Album',
      album_type: album.album_type || existing?.album_type || 'album',
      total_tracks: Number.isFinite(album.total_tracks) ? album.total_tracks : (existing?.total_tracks || 1),
      release_date: normalizeReleaseDate(album.release_date) || existing?.release_date || null,
      release_date_precision: album.release_date_precision || existing?.release_date_precision || 'year',
      image_url: album.images?.[0]?.url || existing?.image_url || null,
      spotify_url: album.external_urls?.spotify || existing?.spotify_url || null,
      label: album.label ?? existing?.label ?? null,
      popularity: Number.isFinite(album.popularity) ? album.popularity : (existing?.popularity || 0),
      available_markets: Array.isArray(album.available_markets)
        ? album.available_markets
        : (existing?.available_markets || []),
      restriction_reason: album.restrictions?.reason || existing?.restriction_reason || null,
      upc: album.external_ids?.upc || existing?.upc || null,
      ean: album.external_ids?.ean || existing?.ean || null,
      last_updated: new Date().toISOString()
    });

    if (Array.isArray(album.artists)) {
      relationshipAlbumIds.push(album.id);
      album.artists.forEach(artist => {
        if (artist?.id) {
          albumArtistsToInsert.push({ album_id: album.id, artist_id: artist.id });
        }
      });
    }

    if (Array.isArray(album.copyrights)) {
      copyrightAlbumIds.push(album.id);
      album.copyrights.forEach(copyright => {
        if (copyright?.text) {
          albumCopyrightsToInsert.push({
            album_id: album.id,
            text: copyright.text,
            type: copyright.type === 'P' ? 'P' : 'C'
          });
        }
      });
    }
  }

  const { error: albumError } = await supabase
    .from('albums')
    .upsert(albumsToInsert, { onConflict: 'id' });
  if (albumError) throw albumError;

  if (relationshipAlbumIds.length > 0) {
    const { error: clearError } = await supabase
      .from('album_artists')
      .delete()
      .in('album_id', Array.from(new Set(relationshipAlbumIds)));
    if (clearError) throw clearError;
  }
  if (albumArtistsToInsert.length > 0) {
    const { error } = await supabase
      .from('album_artists')
      .upsert(albumArtistsToInsert, { onConflict: 'album_id,artist_id' });
    if (error) throw error;
  }

  if (copyrightAlbumIds.length > 0) {
    const { error: clearError } = await supabase
      .from('album_copyrights')
      .delete()
      .in('album_id', Array.from(new Set(copyrightAlbumIds)));
    if (clearError) throw clearError;
  }
  if (albumCopyrightsToInsert.length > 0) {
    const { error } = await supabase
      .from('album_copyrights')
      .insert(albumCopyrightsToInsert);
    if (error) throw error;
  }
}

// 4. Sync Tracks
async function syncTracks(spotifyAccessToken, trackIds, pulledTracks = []) {
  const uniqueIds = Array.from(new Set(trackIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const { data: existingTracks, error: existingTracksError } = await supabase
    .from('tracks')
    .select('*')
    .in('id', uniqueIds);
  if (existingTracksError) throw existingTracksError;
  const existingMap = new Map((existingTracks || []).map(track => [track.id, track]));
  const trackMap = new Map();
  pulledTracks.forEach(track => {
    if (track?.id && uniqueIds.includes(track.id)) trackMap.set(track.id, track);
  });

  const missingIds = uniqueIds.filter(id => !existingMap.has(id) && !trackMap.has(id));
  for (const chunk of chunkArray(missingIds, 50)) {
    try {
      const data = await apiRequest(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
      });
      (data.tracks || []).filter(Boolean).forEach(track => trackMap.set(track.id, track));
    } catch (batchError) {
      if (![400, 403, 404].includes(batchError.status)) throw batchError;
      console.warn(`Track batch lookup failed; using individual requests: ${batchError.message}`);
      for (const id of chunk) {
        try {
          const track = await apiRequest(`https://api.spotify.com/v1/tracks/${id}`, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
          });
          trackMap.set(track.id, track);
        } catch (error) {
          console.warn(`Failed to fetch track ${id}: ${error.message}`);
        }
      }
    }
  }

  if (trackMap.size === 0) return;

  const tracksToInsert = [];
  const trackArtistsToInsert = [];
  const relationshipTrackIds = [];
  const linkedFromIds = new Set();

  for (const track of trackMap.values()) {
    const existing = existingMap.get(track.id);
    if (track.linked_from?.id) linkedFromIds.add(track.linked_from.id);
    tracksToInsert.push({
      id: track.id,
      name: track.name || existing?.name || 'Unknown Track',
      album_id: track.album?.id || existing?.album_id || null,
      duration_ms: Number.isFinite(track.duration_ms) ? track.duration_ms : (existing?.duration_ms || 0),
      explicit: typeof track.explicit === 'boolean' ? track.explicit : (existing?.explicit || false),
      spotify_url: track.external_urls?.spotify || existing?.spotify_url || null,
      popularity: Number.isFinite(track.popularity) ? track.popularity : (existing?.popularity || 0),
      track_number: Number.isFinite(track.track_number) ? track.track_number : (existing?.track_number || 1),
      disc_number: Number.isFinite(track.disc_number) ? track.disc_number : (existing?.disc_number || 1),
      preview_url: track.preview_url ?? existing?.preview_url ?? null,
      is_playable: typeof track.is_playable === 'boolean' ? track.is_playable : (existing?.is_playable ?? true),
      is_local: typeof track.is_local === 'boolean' ? track.is_local : (existing?.is_local || false),
      isrc: track.external_ids?.isrc || existing?.isrc || null,
      available_markets: Array.isArray(track.available_markets)
        ? track.available_markets
        : (existing?.available_markets || []),
      restriction_reason: track.restrictions?.reason || existing?.restriction_reason || null,
      linked_from_track_id: track.linked_from?.id || existing?.linked_from_track_id || null,
      last_updated: new Date().toISOString()
    });

    if (Array.isArray(track.artists)) {
      relationshipTrackIds.push(track.id);
      track.artists.forEach((artist, rank) => {
        if (artist?.id) {
          trackArtistsToInsert.push({
            track_id: track.id,
            artist_id: artist.id,
            artist_rank: rank
          });
        }
      });
    }
  }

  if (linkedFromIds.size > 0) {
    const linkedIds = Array.from(linkedFromIds);
    const { data: existingLinked, error: existingLinkedError } = await supabase
      .from('tracks')
      .select('id')
      .in('id', linkedIds);
    if (existingLinkedError) throw existingLinkedError;

    const existingLinkedIds = new Set((existingLinked || []).map(track => track.id));
    const linkedStubs = linkedIds
      .filter(id => !existingLinkedIds.has(id) && !trackMap.has(id))
      .map(id => ({
        id,
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
    if (linkedStubs.length > 0) {
      const { error } = await supabase
        .from('tracks')
        .upsert(linkedStubs, { onConflict: 'id' });
      if (error) throw error;
    }
  }

  const { error: trackError } = await supabase
    .from('tracks')
    .upsert(tracksToInsert, { onConflict: 'id' });
  if (trackError) throw trackError;

  if (relationshipTrackIds.length > 0) {
    const { error: clearError } = await supabase
      .from('track_artists')
      .delete()
      .in('track_id', Array.from(new Set(relationshipTrackIds)));
    if (clearError) throw clearError;
  }
  if (trackArtistsToInsert.length > 0) {
    const { error } = await supabase
      .from('track_artists')
      .upsert(trackArtistsToInsert, { onConflict: 'track_id,artist_id' });
    if (error) throw error;
  }
}

// 5. Sync Track Audio Features
async function syncAudioFeatures(spotifyAccessToken, trackIds) {
  if (trackIds.length === 0) return;

  // Find which tracks already have audio features
  const { data: existingFeatures, error: existingFeaturesError } = await supabase
    .from('track_audio_features')
    .select('track_id')
    .in('track_id', trackIds);
  if (existingFeaturesError) throw existingFeaturesError;

  const existingIds = new Set(existingFeatures ? existingFeatures.map(f => f.track_id) : []);
  const missingIds = trackIds.filter(id => !existingIds.has(id));

  if (missingIds.length === 0) return;

  console.log(`Syncing audio features for ${missingIds.length} tracks...`);

  const chunks = chunkArray(missingIds, 100);
  for (const chunk of chunks) {
    const data = await apiRequest(`https://api.spotify.com/v1/audio-features?ids=${chunk.join(',')}`, {
      headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
    });

    const featuresToInsert = [];

    const featuresList = data.audio_features || [];
    for (const feat of featuresList) {
      if (!feat) continue;
      featuresToInsert.push({
        track_id: feat.id,
        danceability: feat.danceability || 0,
        energy: feat.energy || 0,
        key: feat.key || 0,
        loudness: feat.loudness || 0,
        mode: feat.mode || 0,
        speechiness: feat.speechiness || 0,
        acousticness: feat.acousticness || 0,
        instrumentalness: feat.instrumentalness || 0,
        liveness: feat.liveness || 0,
        valence: feat.valence || 0,
        tempo: feat.tempo || 0,
        time_signature: feat.time_signature || 4,
        last_updated: new Date().toISOString()
      });
    }

    if (featuresToInsert.length > 0) {
      const { error } = await supabase
        .from('track_audio_features')
        .upsert(featuresToInsert, { onConflict: 'track_id' });
      if (error) throw error;
    }
  }
}

// 6. Record popularity history snapshots
async function recordPopularityHistory(tracks, albums, artists) {
  const now = getDailyCutoffTimestamp();

  // A. Track Popularity History
  const tracksWithPopularity = tracks.filter(track => Number.isFinite(track?.popularity));
  if (tracksWithPopularity.length > 0) {
    const trackHist = tracksWithPopularity.map(t => ({
      track_id: t.id,
      popularity: t.popularity,
      recorded_at: now
    }));
    const { error } = await supabase
      .from('track_popularity_history')
      .upsert(trackHist, { onConflict: 'track_id,recorded_at' });
    if (error) throw error;
  }

  // B. Album Popularity History
  const albumsWithPopularity = albums.filter(album => Number.isFinite(album?.popularity));
  if (albumsWithPopularity.length > 0) {
    const albumHist = albumsWithPopularity.map(a => ({
      album_id: a.id,
      popularity: a.popularity,
      recorded_at: now
    }));
    const { error } = await supabase
      .from('album_popularity_history')
      .upsert(albumHist, { onConflict: 'album_id,recorded_at' });
    if (error) throw error;
  }

  // C. Artist Popularity History
  const artistsWithPopularity = artists.filter(artist =>
    Number.isFinite(artist?.popularity) && (
      Number.isFinite(artist?.followers?.total) ||
      Number.isFinite(artist?.followers_count)
    )
  );
  if (artistsWithPopularity.length > 0) {
    const artistHist = artistsWithPopularity.map(art => ({
      artist_id: art.id,
      popularity: art.popularity,
      followers_count: art.followers?.total ?? art.followers_count,
      recorded_at: now
    }));
    const { error } = await supabase
      .from('artist_popularity_history')
      .upsert(artistHist, { onConflict: 'artist_id,recorded_at' });
    if (error) throw error;
  }
}


// Save stats snapshot into Supabase
async function saveStatsSnapshot(
  userId,
  range,
  avgPopularity,
  explicitPercentage,
  genreDiversity,
  topTracks,
  topArtists,
  topGenres
) {
  const todayStr = getDailySnapshotDate();
  const fetchedAt = getDailyCutoffTimestamp();

  // 1. Create the snapshot row
  const { data: snapshot, error: snapshotErr } = await supabase
    .from('stats_snapshots')
    .upsert({
      user_id: userId,
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

  // A forced/retried run replaces the complete rank lists for this day.
  for (const table of [
    'stats_snapshot_tracks',
    'stats_snapshot_artists',
    'stats_snapshot_genres'
  ]) {
    const { error: clearErr } = await supabase
      .from(table)
      .delete()
      .eq('snapshot_id', snapshotId);
    if (clearErr) throw clearErr;
  }

  // 2. Link tracks
  const trackIdsToLink = Array.from(new Set(topTracks.map(t => t.id).filter(id => !!id)));
  let existingTrackIds = new Set();
  if (trackIdsToLink.length > 0) {
    const { data: dbTracks, error: dbTracksError } = await supabase
      .from('tracks')
      .select('id')
      .in('id', trackIdsToLink);
    if (dbTracksError) throw dbTracksError;
    if (dbTracks) {
      dbTracks.forEach(t => existingTrackIds.add(t.id));
    }
  }

  const seenTrackIds = new Set();
  const trackLinks = [];
  topTracks.forEach(t => {
    if (t.id && existingTrackIds.has(t.id) && !seenTrackIds.has(t.id)) {
      seenTrackIds.add(t.id);
      trackLinks.push({
        snapshot_id: snapshotId,
        track_id: t.id,
        rank: trackLinks.length + 1
      });
    }
  });

  if (trackLinks.length > 0) {
    const { error: trackLinkErr } = await supabase
      .from('stats_snapshot_tracks')
      .upsert(trackLinks, { onConflict: 'snapshot_id,rank' });
    if (trackLinkErr) throw trackLinkErr;
  }

  // 3. Link artists
  const artistIdsToLink = Array.from(new Set(topArtists.map(a => a.id).filter(id => !!id)));
  let existingArtistIds = new Set();
  if (artistIdsToLink.length > 0) {
    const { data: dbArtists, error: dbArtistsError } = await supabase
      .from('artists')
      .select('id')
      .in('id', artistIdsToLink);
    if (dbArtistsError) throw dbArtistsError;
    if (dbArtists) {
      dbArtists.forEach(a => existingArtistIds.add(a.id));
    }
  }

  const seenArtistIds = new Set();
  const artistLinks = [];
  topArtists.forEach(a => {
    if (a.id && existingArtistIds.has(a.id) && !seenArtistIds.has(a.id)) {
      seenArtistIds.add(a.id);
      artistLinks.push({
        snapshot_id: snapshotId,
        artist_id: a.id,
        rank: artistLinks.length + 1
      });
    }
  });

  if (artistLinks.length > 0) {
    const { error: artistLinkErr } = await supabase
      .from('stats_snapshot_artists')
      .upsert(artistLinks, { onConflict: 'snapshot_id,rank' });
    if (artistLinkErr) throw artistLinkErr;
  }

  // 4. Link genres
  const genreLinks = topGenres.map((g, idx) => ({
    snapshot_id: snapshotId,
    genre_name: g.name,
    rank: idx + 1,
    weight: typeof g.percentage === 'number' ? g.percentage : (g.count || 0)
  })).filter(row => !!row.genre_name);

  if (genreLinks.length > 0) {
    // Upsert genres master table first
    const { error: genreErr } = await supabase
      .from('genres')
      .upsert(genreLinks.map(gl => ({ name: gl.genre_name })), { onConflict: 'name' });
    if (genreErr) throw genreErr;

    const { error: linkErr } = await supabase
      .from('stats_snapshot_genres')
      .upsert(genreLinks, { onConflict: 'snapshot_id,rank' });
    if (linkErr) throw linkErr;
  }

  // Raw daily rank history is also a replaceable snapshot. Clear it first so
  // a shorter retry cannot leave stale ranks from an earlier run.
  for (const table of ['user_top_tracks_history', 'user_top_artists_history']) {
    const { error: clearHistoryErr } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .eq('time_range', range)
      .eq('fetched_at', fetchedAt);
    if (clearHistoryErr) throw clearHistoryErr;
  }

  // 5. Save raw top tracks history
  if (trackLinks.length > 0) {
    const topTracksHistory = trackLinks.map(link => ({
      user_id: userId,
      time_range: range,
      rank: link.rank,
      track_id: link.track_id,
      fetched_at: fetchedAt
    }));

    if (topTracksHistory.length > 0) {
      const { error: trackHistErr } = await supabase
        .from('user_top_tracks_history')
        .upsert(topTracksHistory, { onConflict: 'user_id,time_range,fetched_at,rank' });
      if (trackHistErr) throw trackHistErr;
    }
  }

  // 6. Save raw top artists history
  if (artistLinks.length > 0) {
    const topArtistsHistory = artistLinks.map(link => ({
      user_id: userId,
      time_range: range,
      rank: link.rank,
      artist_id: link.artist_id,
      fetched_at: fetchedAt
    }));

    if (topArtistsHistory.length > 0) {
      const { error: artistHistErr } = await supabase
        .from('user_top_artists_history')
        .upsert(topArtistsHistory, { onConflict: 'user_id,time_range,fetched_at,rank' });
      if (artistHistErr) throw artistHistErr;
    }
  }
}

// Sync user's top stats (top 100 songs, artists, and genres)
async function syncUserStats(user, spotifyAccessToken, rangesToSync = ['short_term', 'medium_term', 'long_term']) {
  console.log(`[Sync] Starting stats snapshot sync for user: ${user.display_name} (${user.id})`);
  let completedRanges = 0;
  const artistProfileCache = new Map();

  for (const range of rangesToSync) {
    try {
      console.log(`[Sync] Fetching top items for ${user.display_name} (${range})...`);

      // Fetch top artists
      const artistsRes = await apiRequest(`https://api.spotify.com/v1/me/top/artists?time_range=${range}&limit=50&offset=0&locale=en_US`, {
        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
      });
      const topArtists = artistsRes.items || [];

      // Fetch top tracks page 1 (limit 50, offset 0)
      const tracksRes = await apiRequest(`https://api.spotify.com/v1/me/top/tracks?time_range=${range}&limit=50&offset=0`, {
        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
      });
      const topTracksPage1 = tracksRes.items || [];

      // Fetch top tracks page 2 (limit 50, offset 50)
      let topTracksPage2 = [];
      try {
        const tracksRes2 = await apiRequest(`https://api.spotify.com/v1/me/top/tracks?time_range=${range}&limit=50&offset=50`, {
          headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
        });
        topTracksPage2 = tracksRes2.items || [];
      } catch (e) {
        console.warn(`[Sync] Failed to fetch top tracks page 2 for range ${range}:`, e.message);
      }

      const topTracks = [...topTracksPage1, ...topTracksPage2];

      if (topArtists.length === 0 && topTracks.length === 0) {
        await saveStatsSnapshot(user.id, range, 0, 0, 0, [], [], []);
        console.log(`[Sync] No top artists or tracks for user ${user.id} (${range}); saved an empty completion snapshot.`);
        completedRanges++;
        continue;
      }

      // Fetch each full artist profile at most once during this daily run.
      // Its genres array is authoritative and replaces cached/database genres.
      const topArtistIds = Array.from(new Set(topArtists.map(a => a.id).filter(Boolean)));
      const uncachedArtistIds = topArtistIds.filter(id => !artistProfileCache.has(id));
      for (const chunk of chunkArray(uncachedArtistIds, 50)) {
        try {
          let catalogArtists = [];
          try {
            const res = await apiRequest(`https://api.spotify.com/v1/artists?ids=${chunk.join(',')}&locale=en_US`, {
              headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
            });
            catalogArtists = (res.artists || []).filter(Boolean);
          } catch (batchError) {
            if (![400, 403, 404].includes(batchError.status)) throw batchError;
            for (const id of chunk) {
              try {
                const artist = await apiRequest(`https://api.spotify.com/v1/artists/${id}?locale=en_US`, {
                  headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
                });
                if (artist) catalogArtists.push(artist);
              } catch (individualError) {
                console.warn(`[Sync] Failed to fetch artist ${id}: ${individualError.message}`);
              }
            }
          }

          catalogArtists.forEach(artist => {
            if (artist?.id) artistProfileCache.set(artist.id, artist);
          });
        } catch (err) {
          console.warn('[Sync] Failed to fetch Spotify artist profiles:', err.message);
        }
      }

      topArtists.forEach(artist => {
        const profile = artistProfileCache.get(artist.id);
        if (profile) {
          artist.genres = Array.isArray(profile.genres) ? [...profile.genres] : [];
        }
      });

      // Calculate genres
      const genreCounts = new Map();
      topArtists.forEach((artist, index) => {
        const rankWeight = 50 - index;
        if (artist.genres) {
          artist.genres.forEach(genre => {
            if (genre && genre.trim().toLowerCase() !== 'artist') {
              const current = genreCounts.get(genre) || 0;
              genreCounts.set(genre, current + rankWeight);
            }
          });
        }
      });
      const sortedGenres = Array.from(genreCounts.entries()).sort((a, b) => b[1] - a[1]);
      const totalGenresWeight = sortedGenres.reduce((sum, entry) => sum + entry[1], 0);
      const maxWeight = sortedGenres.length > 0 ? sortedGenres[0][1] : 1;
      const topGenres = sortedGenres.map(([name, weight]) => {
        const percentage = totalGenresWeight > 0 ? Math.min(100, Math.round((weight / totalGenresWeight) * 100)) : 0;
        const percentage_simple = weight > 0 ? Math.max(2, Math.min(100, Math.round((weight / maxWeight) * 100))) : 0;
        return { name, count: Math.round(weight), percentage, percentage_simple };
      }).slice(0, 15);

      // Collect IDs for metadata syncing
      const trackIds = Array.from(new Set(topTracks.map(t => t.id).filter(id => !!id)));
      const artistIds = Array.from(new Set([
        ...topArtists.map(a => a.id).filter(id => !!id),
        ...topTracks.flatMap(t => (t.artists || []).map(a => a.id)).filter(id => !!id),
        ...topTracks.flatMap(t => (t.album?.artists || []).map(a => a.id)).filter(id => !!id)
      ]));
      const albumIds = Array.from(new Set(topTracks.map(t => t.album?.id).filter(id => !!id)));
      const pulledAlbums = Array.from(new Map(
        topTracks
          .map(track => track.album)
          .filter(album => album?.id)
          .map(album => [album.id, album])
      ).values());

      // Sync metadata models
      console.log(`[Sync] Syncing metadata for ${trackIds.length} tracks, ${artistIds.length} artists, ${albumIds.length} albums...`);
      await syncArtists(spotifyAccessToken, artistIds, topArtists);
      await syncAlbums(spotifyAccessToken, albumIds, pulledAlbums);
      await syncTracks(spotifyAccessToken, trackIds, topTracks);
      await recordPopularityHistory(topTracks, [], topArtists);
      try {
        await syncAudioFeatures(spotifyAccessToken, trackIds);
      } catch (audioErr) {
        console.warn(`[Sync] Failed to sync audio features:`, audioErr.message);
      }

      // Compute statistics
      let totalPopularity = 0;
      let explicitCount = 0;
      topTracks.forEach(track => {
        totalPopularity += track.popularity || 0;
        if (track.explicit) explicitCount++;
      });
      const avgPopularity = topTracks.length > 0 ? Math.round(totalPopularity / topTracks.length) : 0;
      const explicitPercentage = topTracks.length > 0 ? Math.round((explicitCount / topTracks.length) * 100) : 0;
      const genreDiversity = topGenres.length;

      // Save stats snapshot
      await saveStatsSnapshot(
        user.id,
        range,
        avgPopularity,
        explicitPercentage,
        genreDiversity,
        topTracks,
        topArtists,
        topGenres
      );
      console.log(`[Sync] Successfully saved stats snapshot for user ${user.id} (${range})`);
      completedRanges++;

    } catch (err) {
      console.error(`[Sync] Error syncing user stats for range ${range}:`, err);
    }
  }

  return {
    completedRanges,
    expectedRanges: rangesToSync.length
  };
}

// Main User Sync process
async function syncUserHistory(user, rangesToSync = []) {
  console.log(`Starting sync for user: ${user.display_name} (${user.id})`);
  
  try {
    // A. Refresh Spotify Access Token
    const spotifyAccessToken = await getSpotifyAccessToken(user.spotify_refresh_token);
    let historySucceeded = true;
    
    // B. Listening history is an intentionally independent, more frequent feed.
    // A failure or an empty response must never prevent the daily stats snapshots.
    try {
      const recentlyPlayed = await apiRequest('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
        headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
      });

      const items = recentlyPlayed.items || [];
      if (items.length === 0) {
        console.log(`No recently played tracks found for user ${user.id}; continuing with stats sync.`);
      } else {
        const trackIds = Array.from(new Set(items.map(item => item.track?.id).filter(Boolean)));
        const pulledTracks = items.map(item => item.track).filter(track => track?.id);
        const pulledAlbums = Array.from(new Map(
          pulledTracks
            .map(track => track.album)
            .filter(album => album?.id)
            .map(album => [album.id, album])
        ).values());
        const artistIds = Array.from(new Set(pulledTracks.flatMap(track =>
          [
            ...(track.artists || []),
            ...(track.album?.artists || [])
          ].map(artist => artist.id).filter(Boolean)
        )));
        const albumIds = pulledAlbums.map(album => album.id);

        // Metadata dependencies are stored before the listening-history links.
        await syncArtists(spotifyAccessToken, artistIds);
        await syncAlbums(spotifyAccessToken, albumIds, pulledAlbums);
        await syncTracks(spotifyAccessToken, trackIds, pulledTracks);

        const historyToInsert = items
          .filter(item => item.track?.id && item.played_at)
          .map(item => ({
            user_id: user.id,
            track_id: item.track.id,
            played_at: item.played_at
          }));

        if (historyToInsert.length > 0) {
          const { error: histErr } = await supabase
            .from('listening_history')
            .upsert(historyToInsert, { onConflict: 'user_id,played_at,track_id' });

          if (histErr) throw histErr;
          console.log(`Synced ${historyToInsert.length} history entries for user ${user.id}`);
        }

        const { data: dbTracks, error: dbTracksError } = await supabase
          .from('tracks')
          .select('id, popularity')
          .in('id', trackIds);
        if (dbTracksError) throw dbTracksError;
        const { data: dbAlbums, error: dbAlbumsError } = await supabase
          .from('albums')
          .select('id, popularity')
          .in('id', albumIds);
        if (dbAlbumsError) throw dbAlbumsError;
        const { data: dbArtists, error: dbArtistsError } = await supabase
          .from('artists')
          .select('id, popularity, followers_count')
          .in('id', artistIds);
        if (dbArtistsError) throw dbArtistsError;
        await recordPopularityHistory(dbTracks || [], dbAlbums || [], dbArtists || []);
      }
    } catch (historyError) {
      historySucceeded = false;
      console.warn(`[Sync] Listening history failed for user ${user.id}; continuing with remaining sync:`, historyError.message);
    }

    // C. Each Supabase snapshot is a per-range daily gate. last_synced_at is
    // only the coarse marker that all three daily ranges are complete.
    if (rangesToSync.length > 0) {
      const statsResult = await syncUserStats(user, spotifyAccessToken, rangesToSync);
      if (statsResult.completedRanges !== statsResult.expectedRanges) {
        throw new Error(
          `Stats sync incomplete (${statsResult.completedRanges}/${statsResult.expectedRanges} ranges); daily marker not updated`
        );
      }
    } else {
      console.log(`All daily stats ranges for ${user.id} already exist; listening history only.`);
    }

    const remainingRanges = await getMissingStatsRanges(user.id);
    if (remainingRanges.length === 0) {
      const { error: markerError } = await supabase
        .from('users')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', user.id);
      if (markerError) throw markerError;
    }

    console.log(`Successfully completed allowed sync work for user ${user.id}\n`);
    return historySucceeded;

  } catch (error) {
    console.error(`FAILED sync for user ${user.id}:`, error.message);
    return false;
  }
}

function isSyncExpired(lastSyncedStr) {
  if (!lastSyncedStr) return true;
  const lastSynced = new Date(lastSyncedStr).getTime();
  return !Number.isFinite(lastSynced) || lastSynced < getDailyCutoff().getTime();
}

async function getMissingStatsRanges(userId) {
  const allRanges = ['short_term', 'medium_term', 'long_term'];
  const { data, error } = await supabase
    .from('stats_snapshots')
    .select('range')
    .eq('user_id', userId)
    .eq('snapshot_date', getDailySnapshotDate())
    .in('range', allRanges);
  if (error) throw error;

  const existingRanges = new Set((data || []).map(snapshot => snapshot.range));
  return allRanges.filter(range => !existingRanges.has(range));
}

// Main entry point
async function main() {
  console.log(`--- Analytify Spotify Sync started at ${new Date().toISOString()} ---`);
  const force = process.argv.includes('--force');
  if (force) {
    console.log('[Sync] Force sync enabled. Ignoring daily limit.');
  }
  
  try {
    // Only explicitly allowlisted owners are eligible for unattended pulls.
    const { data: users, error } = await supabase
      .from('users')
      .select('id, spotify_id, display_name, spotify_refresh_token, last_synced_at')
      .eq('backup_active', true)
      .in('spotify_id', CONFIG.dailyPullSpotifyIds)
      .not('spotify_refresh_token', 'is', null);

    if (error) {
      throw error;
    }

    if (!users || users.length === 0) {
      console.log('No users found with active backup and a valid Spotify refresh token.');
      return;
    }

    console.log(`Found ${users.length} user(s) to synchronize.`);
    let failedUsers = 0;

    // Sync users sequentially to prevent rate limits
    for (const user of users) {
      const markerIsCurrent = !isSyncExpired(user.last_synced_at);
      const rangesToSync = force
        ? ['short_term', 'medium_term', 'long_term']
        : await getMissingStatsRanges(user.id);

      if (markerIsCurrent && rangesToSync.length > 0) {
        console.warn(
          `Daily marker for ${user.display_name} is current but snapshots are incomplete; repairing only missing ranges.`
        );
      }

      if (rangesToSync.length === 0) {
        console.log(`Daily stats for ${user.display_name} are complete; syncing listening history only.`);
      } else {
        console.log(`Missing daily stats ranges for ${user.display_name}: ${rangesToSync.join(', ')}`);
      }

      const succeeded = await syncUserHistory(user, rangesToSync);
      if (!succeeded) failedUsers++;
    }

    if (failedUsers > 0) {
      throw new Error(`${failedUsers} user sync(s) completed with errors`);
    }
    console.log('--- Sync job finished successfully ---');
  } catch (error) {
    console.error('CRITICAL: Sync job failed with error:', error);
    process.exitCode = 1;
  }
}

main();
