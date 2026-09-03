const {TASK_DEFINITIONS, intervalMilliseconds} = require('./task-registry');

function createScheduler({supabase, config, tasks, credentials, pushDispatcher}) {
  async function reconcileAdmins() {
    const {data: profiles, error: profileError} = await supabase.from('users')
      .select('id, spotify_id').in('spotify_id', config.adminSpotifyIds);
    if (profileError) throw profileError;
    const allowedUserIds = (profiles || []).map(profile => profile.id);
    if (allowedUserIds.length) {
      const {error: saveError} = await supabase.from('app_admins').upsert(
        allowedUserIds.map(userId => ({user_id: userId})),
        {onConflict: 'user_id'}
      );
      if (saveError) throw saveError;
    }
    const {data: currentAdmins, error: adminError} = await supabase.from('app_admins').select('user_id');
    if (adminError) throw adminError;
    const staleIds = (currentAdmins || []).map(row => row.user_id).filter(id => !allowedUserIds.includes(id));
    if (staleIds.length) {
      const {error: deleteError} = await supabase.from('app_admins').delete().in('user_id', staleIds);
      if (deleteError) throw deleteError;
    }
    const missingCount = config.adminSpotifyIds.filter(
      id => !(profiles || []).some(profile => profile.spotify_id === id)
    ).length;
    if (missingCount) console.warn(`[Admin] Waiting for ${missingCount} configured administrator profile row(s).`);
  }

  async function enqueueDueJobs(now = new Date()) {
    const {data: settingsRows, error: settingsError} = await supabase.from('sync_user_settings')
      .select('*').eq('enabled', true);
    if (settingsError) throw settingsError;
    if (!settingsRows?.length) return 0;
    const userIds = settingsRows.map(settings => settings.user_id);
    const [
      {data: users, error: userError},
      {data: states, error: stateError},
      {data: credentialRows, error: credentialError}
    ] = await Promise.all([
      supabase.from('users').select('id, backup_active, spotify_refresh_token').in('id', userIds),
      supabase.from('sync_task_state').select('*').in('user_id', userIds),
      supabase.from('spotify_credentials').select('user_id').in('user_id', userIds)
    ]);
    if (userError) throw userError;
    if (stateError) throw stateError;
    if (credentialError) throw credentialError;
    const userById = new Map((users || []).map(user => [user.id, user]));
    const credentialUserIds = new Set((credentialRows || []).map(row => row.user_id));
    const stateByKey = new Map((states || []).map(state => [`${state.user_id}:${state.task_key}`, state]));
    let queued = 0;
    for (const settings of settingsRows) {
      const user = userById.get(settings.user_id);
      if (!user?.backup_active || (!user.spotify_refresh_token && !credentialUserIds.has(user.id))) continue;
      for (const [taskKey, definition] of Object.entries(TASK_DEFINITIONS)) {
        if (!settings[definition.enabledField]) continue;
        const state = stateByKey.get(`${settings.user_id}:${taskKey}`);
        if (state?.next_run_at && new Date(state.next_run_at).getTime() > now.getTime()) continue;
        const {error} = await supabase.from('sync_job_runs').insert({
          user_id: settings.user_id, task_key: taskKey, trigger_type: 'scheduled'
        });
        if (!error) queued++;
        else if (error.code !== '23505') throw error;
      }
    }
    return queued;
  }

  async function claimQueuedJobs() {
    const {data: candidates, error} = await supabase.from('sync_job_runs')
      .select('*').eq('status', 'queued').order('requested_at', {ascending: true})
      .limit(config.maxJobsPerPass);
    if (error) throw error;
    const claimed = [];
    for (const candidate of candidates || []) {
      const {data, error: claimError} = await supabase.from('sync_job_runs').update({
        status: 'running', started_at: new Date().toISOString(), error: null
      }).eq('id', candidate.id).eq('status', 'queued').select('*').maybeSingle();
      if (claimError) throw claimError;
      if (data) claimed.push(data);
    }
    return claimed;
  }

  async function runJob(job) {
    const [{data: user, error: userError}, {data: settings, error: settingsError}] = await Promise.all([
      supabase.from('users').select('id, spotify_id, display_name, spotify_refresh_token, backup_active')
        .eq('id', job.user_id).single(),
      supabase.from('sync_user_settings').select('*').eq('user_id', job.user_id).single()
    ]);
    if (userError) throw userError;
    if (settingsError) throw settingsError;
    const handler = tasks[job.task_key];
    if (!handler) throw new Error(`No handler registered for ${job.task_key}.`);
    const startedAt = new Date().toISOString();
    await supabase.from('sync_task_state').upsert({
      user_id: user.id, task_key: job.task_key, last_started_at: startedAt,
      last_error: null, updated_at: startedAt
    }, {onConflict: 'user_id,task_key'});
    try {
      if (!user.backup_active) throw new Error('Cloud Backup is disabled for this user.');
      const spotifyCredential = await credentials.get(user.id, user.spotify_refresh_token);
      if (!spotifyCredential) throw new Error('Spotify refresh credential is missing.');
      const details = await handler({
        taskKey: job.task_key,
        user: {...user, spotify_credential: spotifyCredential, spotify_refresh_token: undefined},
        settings
      });
      const finishedAt = new Date();
      const nextRunAt = new Date(finishedAt.getTime() + intervalMilliseconds(job.task_key, settings));
      const {error: stateError} = await supabase.from('sync_task_state').upsert({
        user_id: user.id, task_key: job.task_key,
        last_started_at: startedAt, last_success_at: finishedAt.toISOString(),
        next_run_at: nextRunAt.toISOString(), last_error: null, updated_at: finishedAt.toISOString()
      }, {onConflict: 'user_id,task_key'});
      if (stateError) throw stateError;
      const {error: runError} = await supabase.from('sync_job_runs').update({
        status: 'succeeded', finished_at: finishedAt.toISOString(), details: details || {}
      }).eq('id', job.id);
      if (runError) throw runError;
    } catch (error) {
      const message = String(error.message || error).slice(0, 1000);
      const failedAt = new Date();
      const retryAt = new Date(failedAt.getTime() + Math.min(3_600_000, intervalMilliseconds(job.task_key, settings)));
      await supabase.from('sync_task_state').upsert({
        user_id: user.id, task_key: job.task_key, last_started_at: startedAt,
        next_run_at: retryAt.toISOString(), last_error: message, updated_at: failedAt.toISOString()
      }, {onConflict: 'user_id,task_key'});
      await supabase.from('sync_job_runs').update({
        status: 'failed', finished_at: failedAt.toISOString(), error: message
      }).eq('id', job.id);
      console.error(`[Sync] ${job.task_key} failed for ${user.display_name}: ${message}`);
    }
  }

  async function runPass() {
    try {
      await pushDispatcher.dispatchDue(new Date());
    } catch (error) {
      console.error(`[Push] Song League notification pass failed: ${String(error.message || error)}`);
    }
    await reconcileAdmins();
    const queued = await enqueueDueJobs();
    const jobs = await claimQueuedJobs();
    for (const job of jobs) await runJob(job);
    return {queued, processed: jobs.length};
  }

  return {reconcileAdmins, enqueueDueJobs, claimQueuedJobs, runJob, runPass};
}

module.exports = {createScheduler};
