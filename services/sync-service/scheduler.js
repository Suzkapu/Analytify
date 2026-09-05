const {TASK_DEFINITIONS, intervalMilliseconds, isScheduledTaskAllowed} = require('./task-registry');
const {randomUUID} = require('node:crypto');

function isJobAllowed(job, settings, now = new Date()) {
  return job.trigger_type !== 'scheduled' || isScheduledTaskAllowed(job.task_key, settings, now);
}

function createScheduler({supabase, config, tasks, credentials, pushDispatcher}) {
  const workerId = config.workerId || randomUUID();
  const leaseSeconds = Math.max(30, Math.min(900, Number(config.leaseSeconds) || 120));
  const heartbeatIntervalMs = Number(config.heartbeatIntervalMs)
    || Math.max(10_000, Math.floor(leaseSeconds * 1_000 / 3));

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
        if (!isScheduledTaskAllowed(taskKey, settings, now)) continue;
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
    const {data: candidates, error} = await supabase.rpc('claim_sync_jobs', {
      p_worker_id: workerId,
      p_limit: config.maxJobsPerPass,
      p_lease_seconds: leaseSeconds
    });
    if (error) throw error;
    return candidates || [];
  }

  async function completeJob(job, status, state, details = {}) {
    const {error} = await supabase.rpc('complete_sync_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_status: status,
      p_last_started_at: state.lastStartedAt || null,
      p_last_success_at: state.lastSuccessAt || null,
      p_next_run_at: state.nextRunAt || null,
      p_last_error: state.lastError || null,
      p_details: details || {}
    });
    if (error) throw error;
  }

  async function withLeaseHeartbeat(job, work) {
    let heartbeatError = null;
    let heartbeatInFlight = Promise.resolve();
    const timer = setInterval(() => {
      heartbeatInFlight = (async () => {
        const {data, error} = await supabase.rpc('heartbeat_sync_job', {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_lease_seconds: leaseSeconds
        });
        if (error) heartbeatError = error;
        else if (data !== true) heartbeatError = new Error('The sync job lease was lost.');
      })().catch(error => { heartbeatError = error; });
    }, heartbeatIntervalMs);
    timer.unref?.();
    try {
      const result = await work();
      await heartbeatInFlight;
      if (heartbeatError) throw heartbeatError;
      return result;
    } finally {
      clearInterval(timer);
      await heartbeatInFlight;
    }
  }

  async function runJob(job) {
    let user = {id: job.user_id, display_name: job.user_id};
    let settings = {};
    const startedAt = job.started_at || new Date().toISOString();
    try {
      const [{data: loadedUser, error: userError}, {data: loadedSettings, error: settingsError}] = await Promise.all([
        supabase.from('users').select('id, spotify_id, display_name, spotify_refresh_token, backup_active')
          .eq('id', job.user_id).single(),
        supabase.from('sync_user_settings').select('*').eq('user_id', job.user_id).single()
      ]);
      if (userError) throw userError;
      if (settingsError) throw settingsError;
      user = loadedUser;
      settings = loadedSettings;
      const handler = tasks[job.task_key];
      if (!handler) throw new Error(`No handler registered for ${job.task_key}.`);
      if (!isJobAllowed(job, settings)) {
        await completeJob(job, 'cancelled', {}, {reason: 'Outside the configured scheduling day.'});
        return;
      }
      const details = await withLeaseHeartbeat(job, async () => {
        const {error: startedStateError} = await supabase.from('sync_task_state').upsert({
          user_id: user.id, task_key: job.task_key, last_started_at: startedAt,
          last_error: null, updated_at: startedAt
        }, {onConflict: 'user_id,task_key'});
        if (startedStateError) throw startedStateError;
        if (!user.backup_active) throw new Error('Cloud Backup is disabled for this user.');
        const spotifyCredential = await credentials.get(user.id, user.spotify_refresh_token);
        if (!spotifyCredential) throw new Error('Spotify refresh credential is missing.');
        return handler({
          taskKey: job.task_key,
          user: {...user, spotify_credential: spotifyCredential, spotify_refresh_token: undefined},
          settings
        });
      });
      const finishedAt = new Date();
      const nextRunAt = new Date(finishedAt.getTime() + intervalMilliseconds(job.task_key, settings));
      await completeJob(job, 'succeeded', {
        lastStartedAt: startedAt,
        lastSuccessAt: finishedAt.toISOString(),
        nextRunAt: nextRunAt.toISOString(),
        lastError: null
      }, details || {});
    } catch (error) {
      const message = String(error.message || error).slice(0, 1000);
      const failedAt = new Date();
      let retryDelay = 300_000;
      try {
        retryDelay = Math.min(3_600_000, intervalMilliseconds(job.task_key, settings));
      } catch {}
      const retryAt = new Date(failedAt.getTime() + retryDelay);
      console.error(`[Sync][job:${job.id}] ${job.task_key} failed for ${user.display_name}: ${message}`);
      await completeJob(job, 'failed', {
        lastStartedAt: startedAt,
        lastSuccessAt: null,
        nextRunAt: retryAt.toISOString(),
        lastError: message
      });
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

  return {workerId, reconcileAdmins, enqueueDueJobs, claimQueuedJobs, runJob, runPass};
}

module.exports = {createScheduler, isJobAllowed};
