import {mkdtempSync, rmSync, readdirSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const suite = process.argv[2];
if (!['worker', 'edge'].includes(suite)) throw new Error('Choose worker or edge.');
const output = resolve('coverage', suite);
mkdirSync(output, {recursive: true});
const raw = mkdtempSync(join(output, 'raw-'));
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {stdio: 'inherit', env});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}; coverage is unverified.`);
}
try {
  if (suite === 'worker') {
    const tests = ['services/sync-service', 'services/sync-service/tasks'].flatMap(directory =>
      readdirSync(directory).filter(name => name.endsWith('.test.js')).map(name => join(directory, name)));
    run(process.execPath, ['--test', '--test-isolation=none', ...tests], {...process.env, NODE_V8_COVERAGE: raw});
    run(process.execPath, ['scripts/report-worker-v8-coverage.mjs', raw, output]);
  } else {
    const directories = ['_shared', 'spotify-credentials', 'song-league-playlist-sync', 'song-league-notifications'];
    const tests = directories.flatMap(directory => {
      const path = join('supabase/functions', directory);
      return readdirSync(path).filter(name => name.endsWith('.test.ts')).map(name => join(path, name));
    });
    run('deno', ['test', '--config', 'supabase/functions/deno.json', `--coverage=${raw}`, ...tests]);
    run(process.execPath, ['scripts/report-edge-v8-coverage.mjs', raw, output]);
  }
} finally {
  rmSync(raw, {recursive: true, force: true});
}
