import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

// Execute the production activation script against disposable release trees.
// Only external service/network commands are replaced; symlink swaps and the
// EXIT trap run unchanged, including failures after both releases are switched.
for (const failure of ['none', 'worker', 'web']) {
  test(`activation rehearsal restores both releases after ${failure} failure`, () => {
    const root = mkdtempSync(join(tmpdir(), 'analytify-activation-'));
    try {
      const bin = join(root, 'bin');
      const workerRoot = join(root, 'worker');
      const oldWeb = join(root, 'web-releases', 'old');
      const newWeb = join(root, 'web-releases', 'new');
      const oldWorker = join(workerRoot, 'releases', 'old');
      const newWorker = join(workerRoot, 'releases', 'new');
      for (const directory of [bin, oldWeb, newWeb, oldWorker, newWorker]) mkdirSync(directory, {recursive: true});
      const webTarget = join(root, 'web-current');
      const workerTarget = join(workerRoot, 'current');
      symlinkSync(oldWeb, webTarget);
      symlinkSync(oldWorker, workerTarget);
      for (const command of ['sudo', 'systemd-analyze', 'sleep', 'rsync']) {
        writeFileSync(join(bin, command), '#!/bin/sh\nexit 0\n', {mode: 0o755});
      }
      writeFileSync(join(bin, 'curl'), `#!/bin/sh
case "$*" in
  *'/health'*) [ "$REHEARSAL_FAILURE" = worker ] && exit 1 ;;
  *'/version.json'*) [ "$REHEARSAL_FAILURE" = web ] && exit 1 ;;
esac
printf '%s\\n' '{"commit":"candidate"}'
`, {mode: 0o755});
      const result = spawnSync('bash', [resolve('scripts/activate-release.sh'),
        newWeb, webTarget, newWorker, workerRoot, 'candidate', 'https://rehearsal.invalid'], {
        env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REHEARSAL_FAILURE: failure},
        encoding: 'utf8', timeout: 10_000
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, failure === 'none' ? 0 : 1, result.stderr);
      assert.equal(realpathSync(webTarget), failure === 'none' ? newWeb : oldWeb);
      assert.equal(realpathSync(workerTarget), failure === 'none' ? newWorker : oldWorker);
      if (failure !== 'none') assert.match(result.stderr, /restoring the previous web and worker releases/);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });
}
