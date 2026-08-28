function createHistoryTask({supabase, spotify, catalog}) {
  return async function runHistoryTask({user}) {
    const accessToken = await spotify.accessToken(user.spotify_credential);
    const {data: latest, error: latestError} = await supabase.from('listening_history')
      .select('played_at').eq('user_id', user.id)
      .order('played_at', {ascending: false}).limit(1).maybeSingle();
    if (latestError) throw latestError;
    const query = new URLSearchParams({limit: '50'});
    const latestTimestamp = new Date(latest?.played_at || '').getTime();
    if (Number.isFinite(latestTimestamp)) query.set('after', String(latestTimestamp));
    const response = await spotify.api(`/me/player/recently-played?${query.toString()}`, accessToken);
    const items = response?.items || [];
    const tracks = items.map(item => item.track).filter(track => track?.id);
    await catalog.persistPulledTracks(accessToken, tracks);
    const rows = Array.from(new Map(items.filter(item => item.track?.id && item.played_at).map(item => [
      `${item.played_at}:${item.track.id}`,
      {user_id: user.id, track_id: item.track.id, played_at: item.played_at}
    ])).values());
    if (rows.length) {
      const {error} = await supabase.from('listening_history')
        .upsert(rows, {onConflict: 'user_id,played_at,track_id', ignoreDuplicates: true});
      if (error) throw error;
    }
    return {inserted: rows.length};
  };
}

module.exports = {createHistoryTask};
