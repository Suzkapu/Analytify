'use strict';

const {randomUUID} = require('node:crypto');

function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error || 'Unknown worker failure');
}

function createWorkerRuntimeHealth({
  supabase,
  instanceId = randomUUID(),
  commit = 'development',
  heartbeatMs = 30_000,
  logger = console
}) {
  let heartbeatTimer = null;

  async function record(event, error = null) {
    const {error: rpcError} = await supabase.rpc('record_worker_runtime_event', {
      p_instance_id: instanceId,
      p_event: event,
      p_error: error ? describeError(error).slice(0, 2000) : null,
      p_commit_sha: commit
    });
    if (rpcError) throw rpcError;
  }

  function beginHeartbeat() {
    if (!heartbeatMs || heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      record('heartbeat').catch(error => logger.warn('[Sync service] Could not persist worker heartbeat:', error));
    }, heartbeatMs);
    heartbeatTimer.unref?.();
  }

  return {
    instanceId,
    async start() {
      await record('startup');
      beginHeartbeat();
    },
    markReady: () => record('ready'),
    recordPassStarted: () => record('pass_started'),
    recordPassSucceeded: () => record('pass_succeeded'),
    recordFailure: error => record('pass_failed', error),
    async stop() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      await record('stopped');
    }
  };
}

module.exports = {createWorkerRuntimeHealth};
