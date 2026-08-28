function playlistName(leagueName) {
  return `Analytify · ${leagueName} · Weekly Picks`.slice(0, 100);
}

function createSongLeaguePlaylistsTask({supabase, spotify}) {
  async function createPlaylist(accessToken, name, description) {
    const playlist = await spotify.api('/me/playlists', accessToken, {
      method: 'POST',
      body: JSON.stringify({name, description, public: false})
    });
    if (!playlist?.id) throw new Error('Spotify did not return a playlist ID.');
    return {id: playlist.id, url: playlist.external_urls?.spotify || ''};
  }

  async function replacePlaylist(accessToken, playlistId, name, description, trackUris) {
    await spotify.api(`/playlists/${encodeURIComponent(playlistId)}`, accessToken, {
      method: 'PUT', body: JSON.stringify({name, description, public: false})
    });
    await spotify.api(`/playlists/${encodeURIComponent(playlistId)}/items`, accessToken, {
      method: 'PUT', body: JSON.stringify({uris: trackUris.slice(0, 100)})
    });
  }

  return async function runSongLeaguePlaylistsTask({user}) {
    const {data: mappings, error: mappingError} = await supabase.from('song_league_playlists')
      .select('*').eq('user_id', user.id);
    if (mappingError) throw mappingError;
    if (!mappings?.length) return {updated: 0, skipped: 0};
    const accessToken = await spotify.accessToken(user.spotify_credential);
    let updated = 0;
    let skipped = 0;

    for (const mapping of mappings) {
      const {data: payloadRows, error: payloadError} = await supabase.rpc(
        'get_song_league_weekly_playlist_payload',
        {p_league_id: mapping.league_id, p_now: new Date().toISOString()}
      );
      if (payloadError) throw payloadError;
      const payload = payloadRows?.[0];
      if (!payload) {
        skipped++;
        continue;
      }
      const revision = Number(payload.playlist_revision || 0);
      const roundId = payload.round_id || null;
      if (!mapping.last_error
        && Number(mapping.last_synced_revision || 0) >= revision
        && (mapping.last_synced_round_id || null) === roundId) {
        skipped++;
        continue;
      }

      const name = playlistName(payload.league_name);
      const description = `This Friday's Song League picks for ${payload.league_name}. Private and refreshed automatically by Analytify.`.slice(0, 300);
      const trackUris = Array.isArray(payload.track_uris) ? payload.track_uris : [];
      let playlistId = mapping.spotify_playlist_id || '';
      let playlistUrl = mapping.spotify_playlist_url || '';
      try {
        if (!playlistId) {
          const created = await createPlaylist(accessToken, name, description);
          playlistId = created.id;
          playlistUrl = created.url;
        }
        try {
          await replacePlaylist(accessToken, playlistId, name, description, trackUris);
        } catch (error) {
          if (error?.status !== 404) throw error;
          const created = await createPlaylist(accessToken, name, description);
          playlistId = created.id;
          playlistUrl = created.url;
          await replacePlaylist(accessToken, playlistId, name, description, trackUris);
        }
        const {error: saveError} = await supabase.from('song_league_playlists').upsert({
          league_id: mapping.league_id,
          user_id: user.id,
          spotify_playlist_id: playlistId,
          spotify_playlist_url: playlistUrl,
          last_synced_revision: revision,
          last_synced_round_id: roundId,
          last_synced_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString()
        }, {onConflict: 'league_id,user_id'});
        if (saveError) throw saveError;
        updated++;
      } catch (error) {
        await supabase.from('song_league_playlists').update({
          last_error: String(error.message || error).slice(0, 500),
          updated_at: new Date().toISOString()
        }).eq('league_id', mapping.league_id).eq('user_id', user.id);
        throw error;
      }
    }
    return {updated, skipped};
  };
}

module.exports = {createSongLeaguePlaylistsTask};
