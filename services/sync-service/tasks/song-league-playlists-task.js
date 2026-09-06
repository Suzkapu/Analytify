// Spotify mutation authority lives in the versioned Edge Function. The worker
// schedules it with service-role authentication instead of maintaining a second
// implementation that can race or drift from browser-triggered synchronization.
function createSongLeaguePlaylistsTask({supabase}) {
  return async function runSongLeaguePlaylistsTask({user}) {
    const {data: mappings, error: mappingError} = await supabase
      .from('song_league_playlists')
      .select('league_id')
      .eq('user_id', user.id);
    if (mappingError) throw mappingError;

    let updated = 0;
    let skipped = 0;
    const leagueIds = [...new Set((mappings || []).map(mapping => mapping.league_id))];
    for (const leagueId of leagueIds) {
      const {data, error} = await supabase.functions.invoke('song-league-playlist-sync', {
        body: {leagueId, userId: user.id}
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      updated += Number(data?.synced || 0);
      skipped += Number(data?.skipped || 0);
    }
    return {updated, skipped};
  };
}

module.exports = {createSongLeaguePlaylistsTask};
