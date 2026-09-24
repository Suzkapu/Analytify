const {randomUUID} = require('crypto');

const MAX_UPLOAD_CHUNK_TRACKS = 250;
const MAX_UPLOAD_CHUNK_BYTES = 450_000;

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
  const tracks = [];
  const seen = new Set();
  for (let offset = 0; ; offset += pageSize) {
    const pathname = isLikedSongs
      ? `/me/tracks?limit=${pageSize}&offset=${offset}`
      : `/playlists/${encodeURIComponent(playlistId)}/items?limit=${pageSize}&offset=${offset}`;
    const page = await spotify.api(pathname, accessToken);
    for (const entry of page?.items || []) {
      const track = normalizeTrack(entry, tracks.length);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push({...track, playlistIndex: tracks.length + 1});
    }
    if (!page?.next) break;
  }
  return {
    name: isLikedSongs ? 'Favourite Tracks' : metadata?.name || 'Shared playlist',
    description: metadata?.description || '',
    imageUrl: metadata?.images?.[0]?.url || '',
    preservePublishedMetadata: isLikedSongs,
    tracks
  };
}

function buildUploadChunks(tracks) {
  const chunks = [];
  for (let offset = 0; offset < tracks.length;) {
    let end = offset;
    let encodedBytes = 2;
    while (end < tracks.length && end - offset < MAX_UPLOAD_CHUNK_TRACKS) {
      const trackBytes = Buffer.byteLength(JSON.stringify(tracks[end]), 'utf8');
      const nextBytes = encodedBytes + trackBytes + (end === offset ? 0 : 1);
      if (nextBytes > MAX_UPLOAD_CHUNK_BYTES) break;
      encodedBytes = nextBytes;
      end++;
    }
    if (end === offset) throw new Error('A playlist song is too large to share.');
    chunks.push({offset, tracks: tracks.slice(offset, end), encodedBytes});
    offset = end;
  }
  return chunks;
}

function createSharedPlaylistsTask({supabase, spotify}) {

  async function loadPublishedTracks(shareId) {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const {data, error} = await supabase.from('playlist_share_tracks')
        .select('position, track').eq('share_id', shareId).order('position', {ascending: true})
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < pageSize) return rows;
    }
  }

  async function appendUploadChunks(uploadId, tracks) {
    for (const chunk of buildUploadChunks(tracks)) {
      const {error} = await supabase.rpc('append_playlist_share_upload_chunk', {
        p_upload_id: uploadId,
        p_offset: chunk.offset,
        p_tracks: chunk.tracks
      });
      if (error) throw error;
    }
  }

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
    const warnings = [];
    for (const [sourceId, sourceShares] of bySource) {
      const playlist = await loadSharedPlaylistSource(spotify, accessToken, sourceId);
      for (const share of sourceShares) {
        const {data: uploadId, error: beginError} = await supabase.rpc(
          'begin_playlist_share_refresh_upload',
          {
            p_share_id: share.id,
            p_expected_revision: Number(share.revision || 1),
            p_playlist_name: playlist.name,
            p_playlist_description: playlist.description,
            p_playlist_image_url: playlist.imageUrl
          }
        );
        if (beginError) throw beginError;
        await appendUploadChunks(uploadId, playlist.tracks);
        const {data: published, error: publishError} = await supabase.rpc(
          'commit_playlist_share_refresh_upload',
          {p_upload_id: uploadId, p_expected_track_count: playlist.tracks.length}
        );
        if (publishError) throw publishError;
        if (published) refreshed++;
      }
    }
    return {refreshed, warnings};
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
      const leaseToken = randomUUID();
      const expectedAppliedRevision = Number(download.applied_revision || 0);
      const expectedSourceRevision = Number(share.revision || 0);
      const {data: claimed, error: claimError} = await supabase.rpc('claim_playlist_share_sync', {
        p_share_id: share.id,
        p_recipient_user_id: user.id,
        p_expected_source_revision: expectedSourceRevision,
        p_expected_applied_revision: expectedAppliedRevision,
        p_lease_token: leaseToken
      });
      if (claimError) throw claimError;
      if (!claimed) continue;
      try {
        const rows = await loadPublishedTracks(share.id);
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
        const {data: completed, error: saveError} = await supabase.rpc('complete_playlist_share_sync', {
          p_share_id: share.id,
          p_recipient_user_id: user.id,
          p_expected_source_revision: expectedSourceRevision,
          p_expected_applied_revision: expectedAppliedRevision,
          p_lease_token: leaseToken,
          p_spotify_playlist_id: download.spotify_playlist_id,
          p_spotify_playlist_url: download.spotify_playlist_url
        });
        if (saveError) throw saveError;
        if (!completed) throw new Error('Playlist source changed while its Spotify copy was updating.');
        updated++;
      } catch (error) {
        await supabase.rpc('release_playlist_share_sync', {
          p_share_id: share.id, p_recipient_user_id: user.id, p_lease_token: leaseToken
        });
        throw error;
      }
    }
    return updated;
  }

  return async function runSharedPlaylistsTask({user}) {
    const accessToken = await spotify.accessToken(user.spotify_credential);
    const owned = await refreshOwnedShares(user, accessToken);
    return {
      refreshedSources: owned.refreshed,
      updatedCopies: await updateReceivedCopies(user, accessToken),
      warnings: owned.warnings
    };
  };
}

module.exports = {createSharedPlaylistsTask, loadSharedPlaylistSource, buildUploadChunks};
