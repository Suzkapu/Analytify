const DEFAULT_MAX_PAGES_PER_RUN = 20;

function validPlayedAt(value) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function newestPlayedAt(items) {
  let newest = null;
  for (const item of items) {
    const timestamp = validPlayedAt(item?.played_at);
    if (timestamp !== null && (newest === null || timestamp > newest)) newest = timestamp;
  }
  return newest === null ? null : new Date(newest).toISOString();
}

function beforeCursor(response) {
  if (response?.cursors?.before !== undefined && response.cursors.before !== null) {
    return String(response.cursors.before);
  }
  if (!response?.next) return null;
  try {
    return new URL(response.next, 'https://api.spotify.com').searchParams.get('before');
  } catch {
    return null;
  }
}

function laterTimestamp(left, right) {
  const leftTime = validPlayedAt(left);
  const rightTime = validPlayedAt(right);
  if (leftTime === null) return rightTime === null ? null : new Date(rightTime).toISOString();
  if (rightTime === null || leftTime >= rightTime) return new Date(leftTime).toISOString();
  return new Date(rightTime).toISOString();
}

function createHistoryTask({
  supabase,
  spotify,
  catalog,
  maxPagesPerRun = DEFAULT_MAX_PAGES_PER_RUN
}) {
  if (!Number.isInteger(maxPagesPerRun) || maxPagesPerRun < 1) {
    throw new Error('History page limit must be a positive integer.');
  }

  async function loadCheckpoint(userId) {
    const {data, error} = await supabase.from('listening_history_checkpoints')
      .select('user_id, high_water_mark, pending_high_water_mark, pending_before_cursor')
      .eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (data) return data;
    return {
      user_id: userId,
      high_water_mark: null,
      pending_high_water_mark: null,
      pending_before_cursor: null
    };
  }

  async function saveCheckpoint(userId, highWaterMark, pendingHighWaterMark, pendingBeforeCursor) {
    const row = {
      user_id: userId,
      high_water_mark: highWaterMark,
      pending_high_water_mark: pendingHighWaterMark,
      pending_before_cursor: pendingBeforeCursor,
      updated_at: new Date().toISOString()
    };
    const {error} = await supabase.from('listening_history_checkpoints')
      .upsert(row, {onConflict: 'user_id'});
    if (error) throw error;
    return row;
  }

  async function persistPage(userId, accessToken, items, seenPlays) {
    const tracks = items.map(item => item?.track).filter(track => track?.id);
    await catalog.persistPulledTracks(accessToken, tracks);
    const rows = [];
    for (const item of items) {
      if (!item?.track?.id || validPlayedAt(item.played_at) === null) continue;
      const identity = `${item.played_at}:${item.track.id}`;
      if (seenPlays.has(identity)) continue;
      seenPlays.add(identity);
      rows.push({user_id: userId, track_id: item.track.id, played_at: item.played_at});
    }
    if (rows.length) {
      const {error} = await supabase.from('listening_history')
        .upsert(rows, {onConflict: 'user_id,played_at,track_id', ignoreDuplicates: true});
      if (error) throw error;
    }
    return rows.length;
  }

  return async function runHistoryTask({user}) {
    const accessToken = await spotify.accessToken(user.spotify_credential);
    const checkpoint = await loadCheckpoint(user.id);
    const highWaterMark = checkpoint.high_water_mark || null;
    const highWaterTime = validPlayedAt(highWaterMark);
    const resumed = Boolean(checkpoint.pending_before_cursor);
    let pendingHighWaterMark = checkpoint.pending_high_water_mark || null;
    let cursor = checkpoint.pending_before_cursor || null;
    let pages = 0;
    let processed = 0;
    let completed = false;
    const seenPlays = new Set();

    while (pages < maxPagesPerRun) {
      const query = new URLSearchParams({limit: '50'});
      if (cursor) query.set('before', cursor);
      const response = await spotify.api(`/me/player/recently-played?${query.toString()}`, accessToken);
      const items = Array.isArray(response?.items) ? response.items : [];
      if (!pendingHighWaterMark) pendingHighWaterMark = newestPlayedAt(items) || highWaterMark;
      processed += await persistPage(user.id, accessToken, items, seenPlays);
      pages++;

      const pageTimes = items.map(item => validPlayedAt(item?.played_at)).filter(timestamp => timestamp !== null);
      const crossedHighWater = highWaterTime !== null && pageTimes.some(timestamp => timestamp < highWaterTime);
      if (crossedHighWater || !response?.next || items.length === 0) {
        completed = true;
        break;
      }

      const nextCursor = beforeCursor(response);
      if (!nextCursor) {
        throw new Error('Spotify recently-played pagination did not provide a before cursor.');
      }
      if (nextCursor === cursor) {
        throw new Error('Spotify recently-played pagination returned the same before cursor twice.');
      }
      await saveCheckpoint(user.id, highWaterMark, pendingHighWaterMark, nextCursor);
      cursor = nextCursor;
    }

    if (completed) {
      const committedHighWaterMark = laterTimestamp(highWaterMark, pendingHighWaterMark);
      await saveCheckpoint(user.id, committedHighWaterMark, null, null);
      return {
        inserted: processed,
        processed,
        pages,
        resumed,
        truncated: false,
        highWaterMark: committedHighWaterMark
      };
    }

    return {
      inserted: processed,
      processed,
      pages,
      resumed,
      truncated: true,
      highWaterMark,
      pendingHighWaterMark,
      resumeBeforeCursor: cursor,
      backfillPageLimit: maxPagesPerRun
    };
  };
}

module.exports = {
  createHistoryTask,
  beforeCursor,
  DEFAULT_MAX_PAGES_PER_RUN
};
