const {createHash} = require('crypto');

function normalizeTrack(entry, index) {
  const track = entry?.item || entry?.track || entry;
  if (!track?.id || track.type === 'episode') return null;
  const artists = (track.artists || []).filter(artist => artist?.id && artist?.name)
    .map(artist => ({id: artist.id, name: artist.name}));
  if (!track.name || artists.length === 0) return null;
  return {
    id: track.id,
    uri: track.uri || `spotify:track:${track.id}`,
    name: track.name,
    artists,
    albumName: track.album?.name || '',
    imageUrl: track.album?.images?.[0]?.url || '',
    spotifyUrl: track.external_urls?.spotify || '',
    playlistIndex: index + 1,
    durationMs: Number(track.duration_ms || 0),
    explicit: !!track.explicit,
    releaseDate: track.album?.release_date || ''
  };
}

async function loadSharedPlaylistSource(spotify, accessToken, playlistId) {
  const isLikedSongs = playlistId === 'fav';
  const pageSize = isLikedSongs ? 50 : 100;
  const metadata = isLikedSongs
    ? null
    : await spotify.api(`/playlists/${encodeURIComponent(playlistId)}`, accessToken);
  const entries = [];
  for (let offset = 0; ; offset += pageSize) {
    const pathname = isLikedSongs
      ? `/me/tracks?limit=${pageSize}&offset=${offset}`
      : `/playlists/${encodeURIComponent(playlistId)}/items?limit=${pageSize}&offset=${offset}`;
    const page = await spotify.api(pathname, accessToken);
    entries.push(...(page?.items || []));
    if (!page?.next) break;
  }
  const seen = new Set();
  const tracks = entries.map(normalizeTrack).filter(track => {
    if (!track || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  }).map((track, index) => ({...track, playlistIndex: index + 1}));
  return {
    name: isLikedSongs ? 'Favourite Tracks' : metadata?.name || 'Shared playlist',
    description: metadata?.description || '',
    imageUrl: metadata?.images?.[0]?.url || '',
    preservePublishedMetadata: isLikedSongs,
    tracks
  };
}

function createSharedPlaylistsTask({supabase, spotify}) {

  async function refreshOwnedShares(user, accessToken) {
    const {data: shares, error} = await supabase.from('playlist_shares').select('*')
      .eq('owner_user_id', user.id).is('revoked_at', null);
    if (error) throw error;
    const bySource = new Map();
    (shares || []).forEach(share => {
      const group = bySource.get(share.source_playlist_id) || [];
      group.push(share);
      bySource.set(share.source_playlist_id, group);
    });
    let refreshed = 0;
    for (const [sourceId, sourceShares] of bySource) {
      const playlist = await loadSharedPlaylistSource(spotify, accessToken, sourceId);
      const snapshotHash = createHash('sha256').update(JSON.stringify(playlist.tracks)).digest('hex');
      for (const share of sourceShares) {
        const changed = snapshotHash !== share.snapshot_hash;
        if (changed) {
          const {error: clearError} = await supabase.from('playlist_share_tracks').delete().eq('share_id', share.id);
          if (clearError) throw clearError;
          if (playlist.tracks.length) {
            const {error: trackError} = await supabase.from('playlist_share_tracks').insert(
              playlist.tracks.map((track, position) => ({share_id: share.id, position, track_id: track.id, track}))
            );
            if (trackError) throw trackError;
          }
        }
        const {error: updateError} = await supabase.from('playlist_shares').update({
          playlist_name: playlist.name.slice(0, 100),
          playlist_description: playlist.preservePublishedMetadata
            ? share.playlist_description
            : playlist.description.slice(0, 300),
          playlist_image_url: playlist.preservePublishedMetadata
            ? share.playlist_image_url
            : playlist.imageUrl,
          snapshot_hash: snapshotHash,
          track_count: playlist.tracks.length,
          revision: changed ? Number(share.revision || 1) + 1 : Number(share.revision || 1),
          updated_at: new Date().toISOString()
        }).eq('id', share.id);
        if (updateError) throw updateError;
        refreshed++;
      }
    }
    return refreshed;
  }

  async function updateReceivedCopies(user, accessToken) {
    const {data: downloads, error: downloadError} = await supabase.from('playlist_share_downloads')
      .select('*').eq('recipient_user_id', user.id);
    if (downloadError) throw downloadError;
    if (!downloads?.length) return 0;
    const {data: shares, error: shareError} = await supabase.from('playlist_shares').select('*')
      .in('id', downloads.map(download => download.share_id)).is('revoked_at', null);
    if (shareError) throw shareError;
    const shareById = new Map((shares || []).map(share => [share.id, share]));
    let updated = 0;
    for (const download of downloads) {
      const share = shareById.get(download.share_id);
      if (!share || Number(download.applied_revision || 0) >= Number(share.revision || 0)) continue;
      const {data: rows, error: trackError} = await supabase.from('playlist_share_tracks')
        .select('position, track').eq('share_id', share.id).order('position', {ascending: true});
      if (trackError) throw trackError;
      const uris = (rows || []).map(row => row.track?.uri || (row.track?.id ? `spotify:track:${row.track.id}` : '')).filter(Boolean);
      const name = `Analytify · ${share.playlist_name} · from ${share.owner_display_name}`.slice(0, 100);
      const description = `Shared by ${share.owner_display_name} through Analytify. Share ID: ${share.id}`.slice(0, 300);
      await spotify.api(`/playlists/${encodeURIComponent(download.spotify_playlist_id)}`, accessToken, {
        method: 'PUT', body: JSON.stringify({name, description, public: false})
      });
      await spotify.api(`/playlists/${encodeURIComponent(download.spotify_playlist_id)}/items`, accessToken, {
        method: 'PUT', body: JSON.stringify({uris: uris.slice(0, 100)})
      });
      for (let offset = 100; offset < uris.length; offset += 100) {
        await spotify.api(`/playlists/${encodeURIComponent(download.spotify_playlist_id)}/items`, accessToken, {
          method: 'POST', body: JSON.stringify({uris: uris.slice(offset, offset + 100)})
        });
      }
      const {error: saveError} = await supabase.from('playlist_share_downloads').update({
        applied_revision: share.revision, updated_at: new Date().toISOString()
      }).eq('share_id', share.id).eq('recipient_user_id', user.id);
      if (saveError) throw saveError;
      updated++;
    }
    return updated;
  }

  return async function runSharedPlaylistsTask({user}) {
    const accessToken = await spotify.accessToken(user.spotify_credential);
    return {
      refreshedSources: await refreshOwnedShares(user, accessToken),
      updatedCopies: await updateReceivedCopies(user, accessToken)
    };
  };
}

module.exports = {createSharedPlaylistsTask, loadSharedPlaylistSource};
