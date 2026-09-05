const {snapshotDate, cutoffTimestamp} = require('../date-utils');

const RANGE_BY_TASK = {
  stats_short_term: 'short_term',
  stats_medium_term: 'medium_term',
  stats_long_term: 'long_term'
};

function genresFromArtists(artists) {
  const weights = new Map();
  artists.forEach((artist, index) => {
    const rankWeight = 50 - index;
    (artist.genres || []).forEach(name => {
      if (name && name.trim().toLowerCase() !== 'artist') {
        weights.set(name, (weights.get(name) || 0) + rankWeight);
      }
    });
  });
  return Array.from(weights.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 15)
    .map(([name, weight]) => ({name, weight}));
}

async function hydrateArtistGenres(spotify, accessToken, artists, concurrency = 4) {
  if (genresFromArtists(artists).length > 0) return artists;
  const ids = Array.from(new Set(artists.map(artist => artist?.id).filter(Boolean)));
  if (ids.length === 0) return artists;

  const enrichedById = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const artist = await spotify.api(`/artists/${encodeURIComponent(id)}`, accessToken);
        if (artist?.id) enrichedById.set(artist.id, artist);
      } catch (error) {
        console.warn(`[Stats] Artist genre enrichment failed for ${id}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, ids.length)}, () => worker()));
  return artists.map(artist => ({...artist, ...(enrichedById.get(artist.id) || {})}));
}

function deduplicateTracks(tracks) {
  const seenIds = new Set();
  const seenNames = new Set();
  return (tracks || []).filter(track => {
    if (!track || !track.id) return false;
    if (seenIds.has(track.id)) return false;
    const name = (track.name || '').trim().toLowerCase();
    const artist = (track.artists && track.artists[0] && track.artists[0].name
      ? track.artists[0].name
      : track.artist || '').trim().toLowerCase();
    const nameKey = name && artist ? `${name}:::${artist}` : '';
    if (nameKey && seenNames.has(nameKey)) return false;

    seenIds.add(track.id);
    if (nameKey) seenNames.add(nameKey);
    return true;
  });
}

function createStatsTask({supabase, spotify, catalog}) {
  async function saveSnapshot(user, settings, range, topTracks, topArtists, topGenres) {
    const date = snapshotDate(new Date(), settings.timezone);
    const fetchedAt = cutoffTimestamp(new Date(), settings.timezone);
    const explicitCount = topTracks.filter(track => track.explicit).length;
    const explicitPercentage = topTracks.length ? Math.round((explicitCount / topTracks.length) * 100) : 0;
    const trackIds = Array.from(new Set(topTracks.map(track => track.id).filter(Boolean)));
    const artistIds = Array.from(new Set(topArtists.map(artist => artist.id).filter(Boolean)));
    const [{data: storedTracks, error: trackLookupError}, {data: storedArtists, error: artistLookupError}] = await Promise.all([
      trackIds.length ? supabase.from('tracks').select('id').in('id', trackIds) : Promise.resolve({data: [], error: null}),
      artistIds.length ? supabase.from('artists').select('id').in('id', artistIds) : Promise.resolve({data: [], error: null})
    ]);
    if (trackLookupError) throw trackLookupError;
    if (artistLookupError) throw artistLookupError;
    const knownTracks = new Set((storedTracks || []).map(item => item.id));
    const knownArtists = new Set((storedArtists || []).map(item => item.id));
    const trackRows = topTracks.filter(track => knownTracks.has(track.id)).map((track, index) => ({
      track_id: track.id, rank: index + 1
    }));
    const artistRows = topArtists.filter(artist => knownArtists.has(artist.id)).map((artist, index) => ({
      artist_id: artist.id, rank: index + 1
    }));
    const genreRows = topGenres.map((genre, index) => ({
      genre_name: genre.name, rank: index + 1, weight: Math.round(genre.weight || 0)
    }));

    const {data: currentSnapshot, error: revisionError} = await supabase.from('stats_snapshots')
      .select('revision').eq('user_id', user.id).eq('range', range).eq('snapshot_date', date).maybeSingle();
    if (revisionError) throw revisionError;
    const {data: replacement, error} = await supabase.rpc('replace_stats_snapshot_v2', {
      p_user_id: user.id,
      p_range: range,
      p_snapshot_date: date,
      p_explicit_percentage: explicitPercentage,
      p_genre_diversity: topGenres.length,
      p_tracks: trackRows,
      p_artists: artistRows,
      p_genres: genreRows,
      p_fetched_at: fetchedAt,
      p_idempotency_key: `${user.id}:${range}:${date}:${fetchedAt}`,
      p_expected_revision: Number(currentSnapshot?.revision || 0)
    });
    if (error) throw error;
    const snapshotId = Array.isArray(replacement) ? replacement[0]?.snapshot_id : replacement?.snapshot_id;
    if (range === 'short_term') {
      const {error: scoreError} = await supabase.rpc('score_song_league_snapshot', {p_snapshot_id: snapshotId});
      if (scoreError) console.warn(`[Stats] Song League scoring skipped: ${scoreError.message}`);
    }
    return {snapshotId, snapshotDate: date, tracks: trackRows.length, artists: artistRows.length};
  }

  return async function runStatsTask({taskKey, user, settings}) {
    const range = RANGE_BY_TASK[taskKey];
    if (!range) throw new Error(`Unsupported stats task: ${taskKey}`);
    const accessToken = await spotify.accessToken(user.spotify_credential);
    const [artistsResponse, firstTracksResponse] = await Promise.all([
      spotify.api(`/me/top/artists?time_range=${range}&limit=50&offset=0`, accessToken),
      spotify.api(`/me/top/tracks?time_range=${range}&limit=50&offset=0`, accessToken)
    ]);
    let secondTracksResponse = {items: []};
    try {
      secondTracksResponse = await spotify.api(`/me/top/tracks?time_range=${range}&limit=50&offset=50`, accessToken);
    } catch (error) {
      console.warn(`[Stats] Second ${range} track page failed: ${error.message}`);
    }
    let topArtists = artistsResponse?.items || [];
    const rawTracks = [...(firstTracksResponse?.items || []), ...(secondTracksResponse?.items || [])];
    const topTracks = deduplicateTracks(rawTracks);
    topArtists = await hydrateArtistGenres(spotify, accessToken, topArtists);
    await catalog.persistPulledTracks(accessToken, topTracks, topArtists);
    const result = await saveSnapshot(user, settings, range, topTracks, topArtists, genresFromArtists(topArtists));
    const {error: markerError} = await supabase.from('users')
      .update({last_synced_at: new Date().toISOString()}).eq('id', user.id);
    if (markerError) throw markerError;
    return {range, ...result};
  };
}

module.exports = {createStatsTask, RANGE_BY_TASK, genresFromArtists, hydrateArtistGenres, deduplicateTracks};
