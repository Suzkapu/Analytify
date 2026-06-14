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

// Configuration with env variables and fallback defaults
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://tmmhylpexbubyznlizfs.supabase.co',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || 'REDACTED_SPOTIFY_CLIENT_ID',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || 'REDACTED_SPOTIFY_CLIENT_SECRET'
};

if (!CONFIG.supabaseServiceRoleKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY env variable is required to run the daily sync script.');
  process.exit(1);
}

// Initialize Supabase Admin client
const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Helper for HTTP requests using Node.js native fetch
async function apiRequest(url, options = {}) {
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

  // Find which artists already exist in our DB
  const { data: existingArtists } = await supabase
    .from('artists')
    .select('id')
    .in('id', artistIds);

  const existingIds = new Set(existingArtists ? existingArtists.map(a => a.id) : []);
  const missingIds = artistIds.filter(id => !existingIds.has(id));

  if (missingIds.length === 0) return;

  console.log(`Syncing ${missingIds.length} new artists...`);

  // Fetch missing artists from Spotify (max 50 per request)
  const chunks = chunkArray(missingIds, 50);
  for (const chunk of chunks) {
    const data = await apiRequest(`https://api.spotify.com/v1/artists?ids=${chunk.join(',')}`, {
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
          genresToInsert.add(genre);
          artistGenresToInsert.push({
            artist_id: artist.id,
            genre_name: genre
          });
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
    await syncAudioFeatures(spotifyAccessToken, trackIds);

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

    // F. Update user last synced timestamp
    await supabase
      .from('users')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', user.id);

    console.log(`Successfully completed sync for user ${user.id}\n`);

  } catch (error) {
    console.error(`FAILED sync for user ${user.id}:`, error.message);
  }
}

// Main entry point
async function main() {
  console.log(`--- Analytify Spotify Sync started at ${new Date().toISOString()} ---`);
  
  try {
    // Get all users who have backup enabled and have a refresh token
    const { data: users, error } = await supabase
      .from('users')
      .select('id, display_name, spotify_refresh_token')
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
      await syncUserHistory(user);
    }

    console.log('--- Sync job finished successfully ---');
  } catch (error) {
    console.error('CRITICAL: Sync job failed with error:', error);
  }
}

main();
