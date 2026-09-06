import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const assertionScript = resolve('scripts/assert-deployment-freshness.sh');

function git(cwd, ...args) {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout.trim();
}

test('a rapidly superseded commit cannot deploy after newer main', () => {
  const root = mkdtempSync(join(tmpdir(), 'analytify-deploy-order-'));
  const remote = join(root, 'remote.git');
  const checkout = join(root, 'checkout');
  git(root, 'init', '--bare', remote);
  git(root, 'init', checkout);
  git(checkout, 'config', 'user.name', 'Deployment test');
  git(checkout, 'config', 'user.email', 'deployment@example.test');
  git(checkout, 'remote', 'add', 'origin', remote);
  git(checkout, 'commit', '--allow-empty', '-m', 'first');
  git(checkout, 'branch', '-M', 'main');
  git(checkout, 'push', '-u', 'origin', 'main');
  const first = git(checkout, 'rev-parse', 'HEAD');
  assert.equal(spawnSync('bash', [assertionScript, 'refs/heads/main', first], {cwd: checkout}).status, 0);

  git(checkout, 'commit', '--allow-empty', '-m', 'second');
  git(checkout, 'push', 'origin', 'main');
  const second = git(checkout, 'rev-parse', 'HEAD');
  const stale = spawnSync('bash', [assertionScript, 'refs/heads/main', first], {cwd: checkout, encoding: 'utf8'});
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /was superseded by/);
  assert.equal(spawnSync('bash', [assertionScript, 'refs/heads/main', second], {cwd: checkout}).status, 0);
});

test('feature refs can never pass the production freshness gate', () => {
  const result = spawnSync('bash', [assertionScript, 'refs/heads/feature', 'a'.repeat(40)], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is not refs\/heads\/main/);
});
