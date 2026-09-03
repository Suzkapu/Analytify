function createPushDispatcher({supabase}) {
  return {
    async dispatchDue(now = new Date()) {
      const {data, error} = await supabase.functions.invoke('song-league-notifications', {
        body: {now: now.toISOString()}
      });
      if (error) throw new Error(error.message || 'Song League push delivery failed.');
      if (data?.error) throw new Error(data.error);
      return data || {queued: 0, sent: 0, failed: 0};
    }
  };
}

module.exports = {createPushDispatcher};
