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

function createStatsTask({supabase, spotify, catalog}) {
  async function saveSnapshot(user, settings, range, topTracks, topArtists, topGenres) {
    const date = snapshotDate(new Date(), settings.timezone);
    const fetchedAt = cutoffTimestamp(new Date(), settings.timezone);
    const explicitCount = topTracks.filter(track => track.explicit).length;
    const explicitPercentage = topTracks.length ? Math.round((explicitCount / topTracks.length) * 100) : 0;
    let snapshotId = null;
    try {
      const {data: snapshot, error} = await supabase.from('stats_snapshots').upsert({
        user_id: user.id,
        range,
        snapshot_date: date,
        explicit_percentage: explicitPercentage,
        genre_diversity: topGenres.length
      }, {onConflict: 'user_id,range,snapshot_date'}).select('id').single();
      if (error) throw error;
      snapshotId = snapshot.id;

      for (const table of ['stats_snapshot_tracks', 'stats_snapshot_artists', 'stats_snapshot_genres']) {
        const {error: clearError} = await supabase.from(table).delete().eq('snapshot_id', snapshotId);
        if (clearError) throw clearError;
      }

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
        snapshot_id: snapshotId, track_id: track.id, rank: index + 1
      }));
      const artistRows = topArtists.filter(artist => knownArtists.has(artist.id)).map((artist, index) => ({
        snapshot_id: snapshotId, artist_id: artist.id, rank: index + 1
      }));
      const genreRows = topGenres.map((genre, index) => ({
        snapshot_id: snapshotId, genre_name: genre.name, rank: index + 1, weight: genre.weight
      }));

      if (trackRows.length) {
        const {error: trackError} = await supabase.from('stats_snapshot_tracks').insert(trackRows);
        if (trackError) throw trackError;
      }
      if (artistRows.length) {
        const {error: artistError} = await supabase.from('stats_snapshot_artists').insert(artistRows);
        if (artistError) throw artistError;
      }
      if (genreRows.length) {
        const {error: genreError} = await supabase.from('genres')
          .upsert(genreRows.map(item => ({name: item.genre_name})), {onConflict: 'name'});
        if (genreError) throw genreError;
        const {error: relationError} = await supabase.from('stats_snapshot_genres').insert(genreRows);
        if (relationError) throw relationError;
      }

      for (const table of ['user_top_tracks_history', 'user_top_artists_history']) {
        const {error: clearError} = await supabase.from(table).delete()
          .eq('user_id', user.id).eq('time_range', range).eq('fetched_at', fetchedAt);
        if (clearError) throw clearError;
      }
      if (trackRows.length) {
        const {error: historyError} = await supabase.from('user_top_tracks_history').insert(
          trackRows.map(item => ({
            user_id: user.id, time_range: range, rank: item.rank,
            track_id: item.track_id, fetched_at: fetchedAt
          }))
        );
        if (historyError) throw historyError;
      }
      if (artistRows.length) {
        const {error: historyError} = await supabase.from('user_top_artists_history').insert(
          artistRows.map(item => ({
            user_id: user.id, time_range: range, rank: item.rank,
            artist_id: item.artist_id, fetched_at: fetchedAt
          }))
        );
        if (historyError) throw historyError;
      }
      if (range === 'short_term') {
        const {error: scoreError} = await supabase.rpc('score_song_league_snapshot', {p_snapshot_id: snapshotId});
        if (scoreError) console.warn(`[Stats] Song League scoring skipped: ${scoreError.message}`);
      }
      return {snapshotId, snapshotDate: date, tracks: trackRows.length, artists: artistRows.length};
    } catch (error) {
      if (snapshotId) {
        await supabase.from('stats_snapshots').delete().eq('id', snapshotId).eq('user_id', user.id);
      }
      throw error;
    }
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
    const topTracks = [...(firstTracksResponse?.items || []), ...(secondTracksResponse?.items || [])];
    topArtists = await hydrateArtistGenres(spotify, accessToken, topArtists);
    await catalog.persistPulledTracks(accessToken, topTracks, topArtists);
    const result = await saveSnapshot(user, settings, range, topTracks, topArtists, genresFromArtists(topArtists));
    const {error: markerError} = await supabase.from('users')
      .update({last_synced_at: new Date().toISOString()}).eq('id', user.id);
    if (markerError) throw markerError;
    return {range, ...result};
  };
}

module.exports = {createStatsTask, RANGE_BY_TASK, genresFromArtists, hydrateArtistGenres};
