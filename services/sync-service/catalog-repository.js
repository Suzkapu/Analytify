function createCatalogRepository(supabase, spotify) {
  async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await mapper(items[index]);
      }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, () => worker()));
    return results;
  }

  async function syncArtists(accessToken, artistIds, pulledArtists = []) {
    const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const {data: existing, error} = await supabase
      .from('artists').select('id, name, image_url, spotify_url').in('id', uniqueIds);
    if (error) throw error;
    const existingById = new Map((existing || []).map(item => [item.id, item]));
    const suppliedById = new Map(
      pulledArtists.filter(item => item?.id && uniqueIds.includes(item.id)).map(item => [item.id, item])
    );
    const idsToFetch = uniqueIds.filter(id => !suppliedById.has(id) && !existingById.get(id)?.image_url);
    const fetched = await mapWithConcurrency(idsToFetch, 4, async id => {
      try {
        return await spotify.api(`/artists/${encodeURIComponent(id)}`, accessToken);
      } catch (fetchError) {
        console.warn(`[Catalog] Artist ${id} could not be refreshed: ${fetchError.message}`);
        return null;
      }
    });
    const merged = new Map(suppliedById);
    fetched.filter(Boolean).forEach(item => merged.set(item.id, item));
    if (merged.size === 0) return;
    const rows = Array.from(merged.values()).map(item => {
      const previous = existingById.get(item.id);
      return {
        id: item.id,
        name: item.name || previous?.name || 'Unknown Artist',
        image_url: item.images?.[0]?.url || previous?.image_url || null,
        spotify_url: item.external_urls?.spotify || previous?.spotify_url || null,
        last_updated: new Date().toISOString()
      };
    });
    const {error: saveError} = await supabase.from('artists').upsert(rows, {onConflict: 'id'});
    if (saveError) throw saveError;
  }

  function normalizeReleaseDate(value) {
    if (!value) return null;
    if (value.length === 4) return `${value}-01-01`;
    if (value.length === 7) return `${value}-01`;
    return value;
  }

  async function syncAlbums(albumIds, pulledAlbums = []) {
    const uniqueIds = Array.from(new Set(albumIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const {data: existing, error} = await supabase.from('albums')
      .select('id, name, album_type, total_tracks, release_date, release_date_precision, image_url, spotify_url, restriction_reason, upc, ean')
      .in('id', uniqueIds);
    if (error) throw error;
    const existingById = new Map((existing || []).map(item => [item.id, item]));
    const albumsById = new Map(
      pulledAlbums.filter(item => item?.id && uniqueIds.includes(item.id)).map(item => [item.id, item])
    );
    if (albumsById.size === 0) return;
    const rows = [];
    const relationships = [];
    for (const album of albumsById.values()) {
      const previous = existingById.get(album.id);
      rows.push({
        id: album.id,
        name: album.name || previous?.name || 'Unknown Album',
        album_type: album.album_type || previous?.album_type || 'album',
        total_tracks: Number.isFinite(album.total_tracks) ? album.total_tracks : (previous?.total_tracks || 1),
        release_date: normalizeReleaseDate(album.release_date) || previous?.release_date || null,
        release_date_precision: album.release_date_precision || previous?.release_date_precision || 'year',
        image_url: album.images?.[0]?.url || previous?.image_url || null,
        spotify_url: album.external_urls?.spotify || previous?.spotify_url || null,
        restriction_reason: album.restrictions?.reason || previous?.restriction_reason || null,
        upc: album.external_ids?.upc || album.upc || previous?.upc || null,
        ean: album.external_ids?.ean || album.ean || previous?.ean || null,
        last_updated: new Date().toISOString()
      });
      (album.artists || []).forEach(artist => {
        if (artist?.id) relationships.push({album_id: album.id, artist_id: artist.id});
      });
    }
    const {error: saveError} = await supabase.from('albums').upsert(rows, {onConflict: 'id'});
    if (saveError) throw saveError;
    const {error: clearError} = await supabase.from('album_artists').delete().in('album_id', Array.from(albumsById.keys()));
    if (clearError) throw clearError;
    if (relationships.length > 0) {
      const {error: relationError} = await supabase.from('album_artists').upsert(relationships, {onConflict: 'album_id,artist_id'});
      if (relationError) throw relationError;
    }
  }

  async function syncTracks(trackIds, pulledTracks = []) {
    const uniqueIds = Array.from(new Set(trackIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const {data: existing, error} = await supabase.from('tracks')
      .select('id, name, album_id, duration_ms, explicit, spotify_url, track_number, disc_number, is_playable, is_local, isrc, restriction_reason')
      .in('id', uniqueIds);
    if (error) throw error;
    const existingById = new Map((existing || []).map(item => [item.id, item]));
    const tracksById = new Map(
      pulledTracks.filter(item => item?.id && uniqueIds.includes(item.id)).map(item => [item.id, item])
    );
    if (tracksById.size === 0) return;
    const rows = [];
    const relationships = [];
    for (const track of tracksById.values()) {
      const previous = existingById.get(track.id);
      rows.push({
        id: track.id,
        name: track.name || previous?.name || 'Unknown Track',
        album_id: track.album?.id || previous?.album_id || null,
        duration_ms: Number.isFinite(track.duration_ms) ? track.duration_ms : (previous?.duration_ms || 0),
        explicit: typeof track.explicit === 'boolean' ? track.explicit : (previous?.explicit || false),
        spotify_url: track.external_urls?.spotify || previous?.spotify_url || null,
        track_number: Number.isFinite(track.track_number) ? track.track_number : (previous?.track_number || 1),
        disc_number: Number.isFinite(track.disc_number) ? track.disc_number : (previous?.disc_number || 1),
        is_playable: typeof track.is_playable === 'boolean' ? track.is_playable : (previous?.is_playable ?? true),
        is_local: typeof track.is_local === 'boolean' ? track.is_local : (previous?.is_local || false),
        isrc: track.external_ids?.isrc || previous?.isrc || null,
        restriction_reason: track.restrictions?.reason || previous?.restriction_reason || null,
        last_updated: new Date().toISOString()
      });
      (track.artists || []).forEach((artist, rank) => {
        if (artist?.id) relationships.push({track_id: track.id, artist_id: artist.id, artist_rank: rank});
      });
    }
    const {error: saveError} = await supabase.from('tracks').upsert(rows, {onConflict: 'id'});
    if (saveError) throw saveError;
    const {error: clearError} = await supabase.from('track_artists').delete().in('track_id', Array.from(tracksById.keys()));
    if (clearError) throw clearError;
    if (relationships.length > 0) {
      const {error: relationError} = await supabase.from('track_artists').upsert(relationships, {onConflict: 'track_id,artist_rank'});
      if (relationError) throw relationError;
    }
  }

  async function persistPulledTracks(accessToken, tracks, suppliedArtists = []) {
    const validTracks = tracks.filter(track => track?.id);
    const albums = Array.from(new Map(validTracks.filter(track => track.album?.id).map(track => [track.album.id, track.album])).values());
    const artists = Array.from(new Map([
      ...suppliedArtists,
      ...validTracks.flatMap(track => track.artists || []),
      ...albums.flatMap(album => album.artists || [])
    ].filter(artist => artist?.id).map(artist => [artist.id, artist])).values());
    await syncArtists(accessToken, artists.map(item => item.id), suppliedArtists);
    await syncAlbums(albums.map(item => item.id), albums);
    await syncTracks(validTracks.map(item => item.id), validTracks);
  }

  return {syncArtists, syncAlbums, syncTracks, persistPulledTracks};
}

module.exports = {createCatalogRepository};
