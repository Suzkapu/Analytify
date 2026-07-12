/**
 * Analytify - Automated Daily Spotify Pull Script
 * 
 * This script runs in the background (e.g. via Linux cronjob or as a daemon)
 * to pull the recently played Spotify tracks for all registered users and
 * store them securely in the Supabase database.
 * 
 * Required Environment Variables:
 * - SUPABASE_URL: The URL of your Supabase project
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key to bypass RLS policies and sync data
 * - SPOTIFY_CLIENT_ID: Your Spotify Developer Client ID
 * - SPOTIFY_CLIENT_SECRET: Your Spotify Developer Client Secret
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET
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
async function apiRequest(url, options = {}) {
  if (url.startsWith('https://api.spotify.com/v1')) {
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['Accept-Language'] = 'en-GB,en-US;q=0.9,en;q=0.8';
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP Error ${response.status} at ${url}: ${errorText}`);
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
async function syncArtists(spotifyAccessToken, artistIds) {
  if (artistIds.length === 0) return;

  // Find which artists already exist in our DB and are fully synced
  const { data: existingArtists } = await supabase
    .from('artists')
    .select('id, popularity, followers_count')
    .in('id', artistIds);

  const existingIds = new Set();
  if (existingArtists) {
    existingArtists.forEach(a => {
      // Only skip if the artist is fully synced (has popularity > 0 or followers_count > 0)
      if (a.popularity > 0 || a.followers_count > 0) {
        existingIds.add(a.id);
      }
    });
  }

  const missingIds = artistIds.filter(id => !existingIds.has(id));

  if (missingIds.length === 0) return;

  console.log(`Syncing ${missingIds.length} new artists...`);

  // Fetch missing artists from Spotify (max 50 per request)
  const chunks = chunkArray(missingIds, 50);
  for (const chunk of chunks) {
    const data = await apiRequest(`https://api.spotify.com/v1/artists?ids=${chunk.join(',')}&locale=en_US`, {
      headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
    });

    const artistsToInsert = [];
    const genresToInsert = new Set();
    const artistGenresToInsert = [];

    for (const artist of data.artists) {
      if (!artist) continue;
      artistsToInsert.push({
        id: artist.id,
        name: artist.name,
        image_url: artist.images?.[0]?.url || null,
        spotify_url: artist.external_urls?.spotify || null,
        popularity: artist.popularity || 0,
        followers_count: artist.followers?.total || 0,
        last_updated: new Date().toISOString()
      });

      // Collect genres
      if (artist.genres) {
        for (const genre of artist.genres) {
          if (genre && genre.trim().toLowerCase() !== 'artist') {
            genresToInsert.add(genre);
            artistGenresToInsert.push({
              artist_id: artist.id,
              genre_name: genre
            });
          }
        }
      }
    }

    // Insert genres first
    if (genresToInsert.size > 0) {
      await supabase
        .from('genres')
        .upsert(Array.from(genresToInsert).map(name => ({ name })), { onConflict: 'name' });
    }

    // Insert artists
    if (artistsToInsert.length > 0) {
      await supabase
        .from('artists')
        .upsert(artistsToInsert, { onConflict: 'id' });
    }

    // Insert artist genres links
    if (artistGenresToInsert.length > 0) {
      await supabase
        .from('artist_genres')
        .upsert(artistGenresToInsert, { onConflict: 'artist_id,genre_name' });
    }
  }
}

// 3. Sync Albums
async function syncAlbums(spotifyAccessToken, albumIds) {
  if (albumIds.length === 0) return;

  const { data: existingAlbums } = await supabase
    .from('albums')
    .select('id')
    .in('id', albumIds);

  const existingIds = new Set(existingAlbums ? existingAlbums.map(a => a.id) : []);
  const missingIds = albumIds.filter(id => !existingIds.has(id));

  if (missingIds.length === 0) return;

  console.log(`Syncing ${missingIds.length} new albums...`);

  const chunks = chunkArray(missingIds, 20); // Spotify albums endpoint allows max 20 ids
  for (const chunk of chunks) {
    const data = await apiRequest(`https://api.spotify.com/v1/albums?ids=${chunk.join(',')}`, {
      headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
    });

    const albumsToInsert = [];
    const albumArtistsToInsert = [];
    const albumCopyrightsToInsert = [];

    for (const album of data.albums) {
      if (!album) continue;
      albumsToInsert.push({
        id: album.id,
        name: album.name,
        album_type: album.album_type || 'album',
        total_tracks: album.total_tracks || 1,
        release_date: album.release_date ? (album.release_date.length === 4 ? `${album.release_date}-01-01` : (album.release_date.length === 7 ? `${album.release_date}-01` : album.release_date)) : null,
        release_date_precision: album.release_date_precision || 'year',
        image_url: album.images?.[0]?.url || null,
        spotify_url: album.external_urls?.spotify || null,
        label: album.label || null,
        popularity: album.popularity || 0,
        available_markets: album.available_markets || [],
        restriction_reason: album.restrictions?.reason || null,
        last_updated: new Date().toISOString()
      });

      // Link album artists
      if (album.artists) {
        for (const artist of album.artists) {
          albumArtistsToInsert.push({
            album_id: album.id,
            artist_id: artist.id
          });
        }
      }

      // Collect copyrights
      if (album.copyrights) {
        for (const copyright of album.copyrights) {
          albumCopyrightsToInsert.push({
            album_id: album.id,
            text: copyright.text,
            type: copyright.type === 'C' || copyright.type === 'P' ? copyright.type : 'C'
          });
        }
      }
    }

    // Insert albums
    if (albumsToInsert.length > 0) {
      await supabase
        .from('albums')
        .upsert(albumsToInsert, { onConflict: 'id' });
    }

    // Insert album artists link
    if (albumArtistsToInsert.length > 0) {
      await supabase
        .from('album_artists')
        .upsert(albumArtistsToInsert, { onConflict: 'album_id,artist_id' });
    }

    // Insert album copyrights
    if (albumCopyrightsToInsert.length > 0) {
      await supabase
        .from('album_copyrights')
        .insert(albumCopyrightsToInsert);
    }
  }
}

// 4. Sync Tracks
async function syncTracks(spotifyAccessToken, trackIds) {
  if (trackIds.length === 0) return;

  const { data: existingTracks } = await supabase
    .from('tracks')
    .select('id')
    .in('id', trackIds);

  const existingIds = new Set(existingTracks ? existingTracks.map(t => t.id) : []);
  const missingIds = trackIds.filter(id => !existingIds.has(id));

  if (missingIds.length === 0) return;

  console.log(`Syncing ${missingIds.length} new tracks...`);

  const chunks = chunkArray(missingIds, 50);
  for (const chunk of chunks) {
    const data = await apiRequest(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
      headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
    });

    const tracksToInsert = [];
    const trackArtistsToInsert = [];

    for (const track of data.tracks) {
      if (!track) continue;
      tracksToInsert.push({
        id: track.id,
        name: track.name,
        album_id: track.album?.id || null,
        duration_ms: track.duration_ms || 0,
        explicit: track.explicit || false,
        spotify_url: track.external_urls?.spotify || null,
        popularity: track.popularity || 0,
        track_number: track.track_number || 1,
        disc_number: track.disc_number || 1,
        preview_url: track.preview_url || null,
        is_playable: track.is_playable !== false,
        is_local: track.is_local || false,
        isrc: track.external_ids?.isrc || null,
        available_markets: track.available_markets || [],
        restriction_reason: track.restrictions?.reason || null,
        last_updated: new Date().toISOString()
      });

      // Link track artists
      if (track.artists) {
        track.artists.forEach((artist, rank) => {
          trackArtistsToInsert.push({
            track_id: track.id,
            artist_id: artist.id,
            artist_rank: rank
          });
        });
      }
    }

    // Insert tracks
    if (tracksToInsert.length > 0) {
      await supabase
        .from('tracks')
        .upsert(tracksToInsert, { onConflict: 'id' });
    }

    // Insert track artists link
    if (trackArtistsToInsert.length > 0) {
      await supabase
        .from('track_artists')
        .upsert(trackArtistsToInsert, { onConflict: 'track_id,artist_id' });
    }
  }
}

// 5. Sync Track Audio Features
async function syncAudioFeatures(spotifyAccessToken, trackIds) {
  if (trackIds.length === 0) return;

  // Find which tracks already have audio features
  const { data: existingFeatures } = await supabase
    .from('track_audio_features')
    .select('track_id')
    .in('track_id', trackIds);

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
      await supabase
        .from('track_audio_features')
        .upsert(featuresToInsert, { onConflict: 'track_id' });
    }
  }
}

// 6. Record popularity history snapshots
async function recordPopularityHistory(tracks, albums, artists) {
  const now = new Date().toISOString();

  // A. Track Popularity History
  if (tracks.length > 0) {
    const trackHist = tracks.map(t => ({
      track_id: t.id,
      popularity: t.popularity || 0,
      recorded_at: now
    }));
    await supabase.from('track_popularity_history').insert(trackHist);
  }

  // B. Album Popularity History
  if (albums.length > 0) {
    const albumHist = albums.map(a => ({
      album_id: a.id,
      popularity: a.popularity || 0,
      recorded_at: now
    }));
    await supabase.from('album_popularity_history').insert(albumHist);
  }

  // C. Artist Popularity History
  if (artists.length > 0) {
    const artistHist = artists.map(art => ({
      artist_id: art.id,
      popularity: art.popularity || 0,
      followers_count: art.followers?.total || art.followers_count || 0,
      recorded_at: now
    }));
    await supabase.from('artist_popularity_history').insert(artistHist);
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
  const todayStr = new Date().toISOString().split('T')[0];

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

  // 2. Link tracks
  const trackIdsToLink = Array.from(new Set(topTracks.map(t => t.id).filter(id => !!id)));
  let existingTrackIds = new Set();
  if (trackIdsToLink.length > 0) {
    const { data: dbTracks } = await supabase
      .from('tracks')
      .select('id')
      .in('id', trackIdsToLink);
    if (dbTracks) {
      dbTracks.forEach(t => existingTrackIds.add(t.id));
    }
  }

  const seenTrackIds = new Set();
  const trackLinks = [];
  topTracks.forEach((t, idx) => {
    if (t.id && existingTrackIds.has(t.id) && !seenTrackIds.has(t.id)) {
      seenTrackIds.add(t.id);
      trackLinks.push({
        snapshot_id: snapshotId,
        track_id: t.id,
        rank: idx + 1
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
    const { data: dbArtists } = await supabase
      .from('artists')
      .select('id')
      .in('id', artistIdsToLink);
    if (dbArtists) {
      dbArtists.forEach(a => existingArtistIds.add(a.id));
    }
  }

  const seenArtistIds = new Set();
  const artistLinks = [];
  topArtists.forEach((a, idx) => {
    if (a.id && existingArtistIds.has(a.id) && !seenArtistIds.has(a.id)) {
      seenArtistIds.add(a.id);
      artistLinks.push({
        snapshot_id: snapshotId,
        artist_id: a.id,
        rank: idx + 1
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

  // 5. Save raw top tracks history
  if (topTracks.length > 0) {
    const fetchedAt = new Date().toISOString();
    const topTracksHistory = topTracks.map((t, idx) => ({
      user_id: userId,
      time_range: range,
      rank: idx + 1,
      track_id: t.id,
      fetched_at: fetchedAt
    })).filter(row => !!row.track_id);

    if (topTracksHistory.length > 0) {
      const { error: trackHistErr } = await supabase
        .from('user_top_tracks_history')
        .upsert(topTracksHistory, { onConflict: 'user_id,time_range,fetched_at,rank' });
      if (trackHistErr) {
        console.warn(`[Sync] Error saving user top tracks history: ${trackHistErr.message}`);
      }
    }
  }

  // 6. Save raw top artists history
  if (topArtists.length > 0) {
    const fetchedAt = new Date().toISOString();
    const topArtistsHistory = topArtists.map((a, idx) => ({
      user_id: userId,
      time_range: range,
      rank: idx + 1,
      artist_id: a.id,
      fetched_at: fetchedAt
    })).filter(row => !!row.artist_id);

    if (topArtistsHistory.length > 0) {
      const { error: artistHistErr } = await supabase
        .from('user_top_artists_history')
        .upsert(topArtistsHistory, { onConflict: 'user_id,time_range,fetched_at,rank' });
      if (artistHistErr) {
        console.warn(`[Sync] Error saving user top artists history: ${artistHistErr.message}`);
      }
    }
  }
}

// Sync user's top stats (top 100 songs, artists, and genres)
async function syncUserStats(user, spotifyAccessToken) {
  console.log(`[Sync] Starting stats snapshot sync for user: ${user.display_name} (${user.id})`);
  const ranges = ['short_term', 'medium_term', 'long_term'];

  for (const range of ranges) {
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
        console.log(`[Sync] No top artists or tracks for user ${user.id} (${range}), skipping snapshot.`);
        continue;
      }

      // Backfill empty genres from the database (Spotify API often returns empty genres)
      const artistsWithEmptyGenres = topArtists.filter(a => a.id && (!a.genres || a.genres.length === 0));
      if (artistsWithEmptyGenres.length > 0) {
        const emptyIds = artistsWithEmptyGenres.map(a => a.id);
        const { data: dbGenres } = await supabase
          .from('artist_genres')
          .select('artist_id, genre_name')
          .in('artist_id', emptyIds);

        const genreMap = new Map();
        if (dbGenres && dbGenres.length > 0) {
          dbGenres.forEach(row => {
            const existing = genreMap.get(row.artist_id) || [];
            existing.push(row.genre_name);
            genreMap.set(row.artist_id, existing);
          });

          topArtists.forEach(a => {
            if (a.id && (!a.genres || a.genres.length === 0) && genreMap.has(a.id)) {
              a.genres = genreMap.get(a.id);
            }
          });
          console.log(`[Sync] Enriched ${genreMap.size} artists with genres from database`);
        }

        // Query Spotify catalog API directly for any remaining empty artists (max 50 per request)
        const stillEmptyIds = topArtists
          .filter(a => a.id && (!a.genres || a.genres.length === 0))
          .map(a => a.id);

        if (stillEmptyIds.length > 0) {
          console.log(`[Sync] Querying Spotify catalog API for genres of ${stillEmptyIds.length} artists...`);
          const chunks = chunkArray(stillEmptyIds, 50);
          for (const chunk of chunks) {
            try {
              const res = await apiRequest(`https://api.spotify.com/v1/artists?ids=${chunk.join(',')}&locale=en_US`, {
                headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
              });

              if (res && res.artists) {
                const apiArtistsToSync = [];
                res.artists.forEach(art => {
                  if (art && art.genres && art.genres.length > 0) {
                    topArtists.forEach(a => {
                      if (a.id === art.id) {
                        a.genres = art.genres;
                      }
                    });
                    apiArtistsToSync.push(art);
                  }
                });

                // Sync these full profiles back to the database
                if (apiArtistsToSync.length > 0) {
                  // Re-use syncArtists logic to update them in Supabase
                  await syncArtists(spotifyAccessToken, apiArtistsToSync.map(a => a.id));
                }
              }
            } catch (err) {
              console.warn(`[Sync] Failed to fetch artist catalog genres chunk:`, err.message);
            }
          }
        }
      }

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
        ...topTracks.flatMap(t => (t.artists || []).map(a => a.id)).filter(id => !!id)
      ]));
      const albumIds = Array.from(new Set(topTracks.map(t => t.album?.id).filter(id => !!id)));

      // Sync metadata models
      console.log(`[Sync] Syncing metadata for ${trackIds.length} tracks, ${artistIds.length} artists, ${albumIds.length} albums...`);
      await syncArtists(spotifyAccessToken, artistIds);
      await syncAlbums(spotifyAccessToken, albumIds);
      await syncTracks(spotifyAccessToken, trackIds);
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

    } catch (err) {
      console.error(`[Sync] Error syncing user stats for range ${range}:`, err);
    }
  }
}

// Main User Sync process
async function syncUserHistory(user) {
  console.log(`Starting sync for user: ${user.display_name} (${user.id})`);
  
  try {
    // A. Refresh Spotify Access Token
    const spotifyAccessToken = await getSpotifyAccessToken(user.spotify_refresh_token);
    
    // B. Fetch Recently Played Tracks from Spotify
    const recentlyPlayed = await apiRequest('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
    });

    const items = recentlyPlayed.items || [];
    if (items.length === 0) {
      console.log(`No recently played tracks found for user ${user.id}`);
      return;
    }

    // Collect all track, artist, and album IDs
    const trackIds = Array.from(new Set(items.map(item => item.track.id)));
    const artistIds = Array.from(new Set(items.flatMap(item => item.track.artists.map(a => a.id))));
    const albumIds = Array.from(new Set(items.map(item => item.track.album.id)));

    // C. Sync metadata in sequence (dependencies first)
    await syncArtists(spotifyAccessToken, artistIds);
    await syncAlbums(spotifyAccessToken, albumIds);
    await syncTracks(spotifyAccessToken, trackIds);
    // NOTE: Spotify deprecated the audio-features endpoint for new apps (May 2024), skip it
    // await syncAudioFeatures(spotifyAccessToken, trackIds);

    // D. Insert Listening History events
    const historyToInsert = items.map(item => ({
      user_id: user.id,
      track_id: item.track.id,
      played_at: item.played_at
    }));

    if (historyToInsert.length > 0) {
      const { error: histErr } = await supabase
        .from('listening_history')
        .upsert(historyToInsert, { onConflict: 'user_id,played_at,track_id' });
        
      if (histErr) {
        console.error(`Error saving listening history for user ${user.id}:`, histErr);
      } else {
        console.log(`Synced ${historyToInsert.length} history entries for user ${user.id}`);
      }
    }

    // E. Save current popularities into history for popularity charts
    // Fetch newly updated items from our database to record history
    const { data: dbTracks } = await supabase.from('tracks').select('id, popularity').in('id', trackIds);
    const { data: dbAlbums } = await supabase.from('albums').select('id, popularity').in('id', albumIds);
    const { data: dbArtists } = await supabase.from('artists').select('id, popularity, followers_count').in('id', artistIds);

    await recordPopularityHistory(dbTracks || [], dbAlbums || [], dbArtists || []);

    // F. Sync Stats Snapshots (top tracks, top artists, top genres)
    await syncUserStats(user, spotifyAccessToken);

    // G. Update user last synced timestamp
    await supabase
      .from('users')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', user.id);

    console.log(`Successfully completed sync for user ${user.id}\n`);

  } catch (error) {
    console.error(`FAILED sync for user ${user.id}:`, error.message);
  }
}

// Helper to check if a sync has already run today (since the 1:00 AM cutoff)
function isSyncExpired(lastSyncedStr) {
  if (!lastSyncedStr) return true;
  const lastSynced = new Date(lastSyncedStr).getTime();
  if (isNaN(lastSynced)) return true;

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(1, 0, 0, 0); // 1:00 AM today
  if (now.getTime() < cutoff.getTime()) {
    // If we haven't reached 1 AM today yet, the most recent cutoff was 1 AM yesterday
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return lastSynced < cutoff.getTime();
}

// Main entry point
async function main() {
  console.log(`--- Analytify Spotify Sync started at ${new Date().toISOString()} ---`);
  const force = process.argv.includes('--force');
  if (force) {
    console.log('[Sync] Force sync enabled. Ignoring daily limit.');
  }
  
  try {
    // Get all users who have backup enabled and have a refresh token
    const { data: users, error } = await supabase
      .from('users')
      .select('id, display_name, spotify_refresh_token, last_synced_at')
      .eq('backup_active', true)
      .not('spotify_refresh_token', 'is', null);

    if (error) {
      throw error;
    }

    if (!users || users.length === 0) {
      console.log('No users found with active backup and a valid Spotify refresh token.');
      return;
    }

    console.log(`Found ${users.length} user(s) to synchronize.`);

    // Sync users sequentially to prevent rate limits
    for (const user of users) {
      if (!force && user.last_synced_at && !isSyncExpired(user.last_synced_at)) {
        console.log(`Skipping user ${user.display_name} (${user.id}) - already synced today at ${user.last_synced_at}`);
        continue;
      }
      await syncUserHistory(user);
    }

    console.log('--- Sync job finished successfully ---');
  } catch (error) {
    console.error('CRITICAL: Sync job failed with error:', error);
  }
}

main();
