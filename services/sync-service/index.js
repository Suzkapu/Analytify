const {createClient} = require('@supabase/supabase-js');
const ws = require('ws');

const {loadConfig} = require('./config');
const {createSpotifyClient} = require('./spotify-client');
const {createTaskRegistry} = require('./task-registry');
const {createScheduler} = require('./scheduler');
const {createCredentialStore} = require('./credential-store');
const {createPushDispatcher} = require('./push-dispatcher');
const {createHealthServer, deployedCommit} = require('./health-server');
const {createWorkerRuntimeHealth} = require('./worker-runtime-health');

async function createService() {
  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {persistSession: false, autoRefreshToken: false},
    realtime: {transport: ws}
  });
  const {error: releaseError} = await supabase.from('deployment_revisions').upsert({
    component: 'worker', commit_sha: deployedCommit(), deployed_at: new Date().toISOString()
  }, {onConflict: 'component'});
  if (releaseError) throw releaseError;
  const runtime = createWorkerRuntimeHealth({supabase, commit: deployedCommit()});
  await runtime.start();
  const spotify = createSpotifyClient(config);
  const credentials = createCredentialStore({
    supabase,
    encryptionKey: config.spotifyTokenEncryptionKey,
    encryptionKeys: config.spotifyTokenEncryptionKeys,
    writeKeyVersion: config.spotifyTokenEncryptionWriteVersion
  });
  const pushDispatcher = createPushDispatcher({supabase});
  const migratedCredentials = await credentials.migrateAllLegacy();
  if (migratedCredentials) {
    console.log(`[Sync service] Encrypted ${migratedCredentials} legacy Spotify credential(s).`);
  }
  const rotation = await credentials.rotatePending();
  if (rotation.examined) {
    console.log(`[Sync service] Credential rotation: ${rotation.rotated} succeeded, ${rotation.failed} deferred.`);
  }
  const tasks = createTaskRegistry({supabase, spotify});
  const scheduler = createScheduler({supabase, config, tasks, credentials, pushDispatcher});
  return {config, scheduler, runtime};
}

async function main(argv = process.argv.slice(2)) {
  const watch = argv.includes('--watch');
  const health = createHealthServer({port: Math.max(1, Number(process.env.SYNC_SERVICE_HEALTH_PORT) || 8787)});
  await health.listen();
  let service;
  try {
    service = await createService();
    health.markReady();
  } catch (error) {
    health.recordFailure(error);
    await health.close();
    throw error;
  }
  const {config, scheduler, runtime} = service;
  try {
    await runtime.markReady();
  } catch (error) {
    health.recordFailure(error);
    await health.close();
    throw error;
  }
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });

  do {
    const startedAt = Date.now();
    try {
      await runtime.recordPassStarted();
      const result = await scheduler.runPass();
      health.recordPass();
      await runtime.recordPassSucceeded();
      console.log(`[Sync service] Pass complete: ${result.queued} queued, ${result.processed} processed.`);
    } catch (error) {
      console.error('[Sync service] Pass failed:', error);
      health.recordFailure(error);
      try {
        await runtime.recordFailure(error);
      } catch (runtimeError) {
        console.error('[Sync service] Could not persist worker failure:', runtimeError);
      }
      if (!watch) throw error;
    }
    if (!watch || stopping) break;
    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(1_000, config.pollSeconds * 1_000 - elapsed);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  } while (!stopping);
  try {
    await runtime.stop();
  } finally {
    await health.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[Sync service] Fatal error:', error);
    process.exitCode = 1;
  });
}

module.exports = {createService, main};
