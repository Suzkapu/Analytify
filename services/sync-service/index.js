const {createClient} = require('@supabase/supabase-js');
const ws = require('ws');

const {loadConfig} = require('./config');
const {createSpotifyClient} = require('./spotify-client');
const {createTaskRegistry} = require('./task-registry');
const {createScheduler} = require('./scheduler');

async function createService() {
  const config = loadConfig();
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {persistSession: false, autoRefreshToken: false},
    realtime: {transport: ws}
  });
  const spotify = createSpotifyClient(config);
  const tasks = createTaskRegistry({supabase, spotify});
  const scheduler = createScheduler({supabase, config, tasks});
  return {config, scheduler};
}

async function main(argv = process.argv.slice(2)) {
  const watch = argv.includes('--watch');
  const {config, scheduler} = await createService();
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });

  do {
    const startedAt = Date.now();
    try {
      const result = await scheduler.runPass();
      console.log(`[Sync service] Pass complete: ${result.queued} queued, ${result.processed} processed.`);
    } catch (error) {
      console.error('[Sync service] Pass failed:', error);
      if (!watch) throw error;
    }
    if (!watch || stopping) break;
    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(1_000, config.pollSeconds * 1_000 - elapsed);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  } while (!stopping);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[Sync service] Fatal error:', error);
    process.exitCode = 1;
  });
}

module.exports = {createService, main};
