import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/preview.yml', import.meta.url), 'utf8');
const jobBody = name => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:\\n|(?![\\s\\S]))`, 'm'))?.[1];
const condition = name => jobBody(name)?.match(/^    if: (.+)$/m)?.[1];

test('registered preview dispatch defaults to a required boolean test-only mode', () => {
  assert.match(workflow, /^  workflow_dispatch:\n    inputs:\n      friends_contract_only:\n        description: Run only isolated Friends contracts without deployment\n        type: boolean\n        required: true\n        default: true\n/m);
  assert.equal(condition('verify'), "github.event_name != 'workflow_dispatch' || !inputs.friends_contract_only");
  assert.equal(condition('deploy'), "github.event_name != 'pull_request' && github.ref == 'refs/heads/codex/design-v2' && (github.event_name != 'workflow_dispatch' || !inputs.friends_contract_only)");
  assert.match(jobBody('deploy'), /^    needs: \[verify, friends-http-contract\]$/m);
  assert.doesNotMatch(jobBody('friends-http-contract'), /^    if:/m, 'The real contract must still run when the normal verification job is skipped.');
  assert.match(workflow, /^permissions:\n  contents: read$/m);
});

test('actual job conditions prevent test-only deployment and preserve ordinary release boundaries', () => {
  const development = 'refs/heads/codex/design-v2';
  const scenarios = [
    {event: 'workflow_dispatch', ref: development, only: true, verify: false, deploy: false},
    {event: 'workflow_dispatch', ref: development, only: false, verify: true, deploy: true},
    {event: 'push', ref: development, verify: true, deploy: true},
    {event: 'pull_request', ref: 'refs/pull/1/merge', verify: true, deploy: false},
    {event: 'pull_request', ref: development, verify: true, deploy: false},
    {event: 'push', ref: 'refs/heads/main', verify: true, deploy: false},
    {event: 'workflow_dispatch', ref: 'refs/heads/main', only: false, verify: true, deploy: false},
    {event: 'workflow_dispatch', ref: 'refs/heads/main', only: true, verify: false, deploy: false},
  ];
  for (const scenario of scenarios) {
    const context = {github: {event_name: scenario.event, ref: scenario.ref}, inputs: {friends_contract_only: scenario.only}};
    for (const job of ['verify', 'deploy']) {
      assert.equal(runInNewContext(condition(job), context, {timeout: 1000}), scenario[job], `${job}: ${JSON.stringify(scenario)}`);
    }
  }
});

test('test-only mode preserves the real isolated contract and failure behavior', () => {
  const job = jobBody('friends-http-contract');
  assert.ok(job, 'The isolated HTTP contract job must exist.');
  assert.match(job, /^    runs-on: ubuntu-24\.04$/m);
  assert.match(job, /node-version: '24\.15\.0'/);
  assert.match(job, /run: npm install --global npm@12\.0\.2/);
  assert.match(job, /run: npm ci/);
  assert.match(job, /run: node --test scripts\/provision-isolated-friends-runtime\.test\.mjs/);
  assert.match(job, /run: node integration\/friends-http\/verify-isolation\.mjs/);
  assert.match(job, /node scripts\/provision-isolated-friends-runtime\.mjs > docs\/testing-evidence\/design-v2\/friends-http-ci-artifacts\/runtime\.json/);
  assert.match(job, /ANALYTIFY_TEST_POSTGRES_ROOT="\$\(jq -er \.postgresRoot /);
  assert.match(job, /ANALYTIFY_TEST_POSTGREST_ROOT="\$\(jq -er \.postgrestRoot /);
  assert.match(job, /node scripts\/test-isolated-friends-http-contract\.mjs --angular-contract > docs\/testing-evidence\/design-v2\/friends-http-ci-artifacts\/contract\.log 2>&1/);
  assert.doesNotMatch(job, /continue-on-error|--handshake-only|\|\| true|--skip|--update|secrets\.|deploy-preview|deploy-supabase|activate-release|DATABASE_URL|SUPABASE_URL/);
  assert.doesNotMatch(job, /^    (?:environment|services|container|permissions):/m);
});

test('isolated job uses only pinned reviewed actions and retains evidence on failure', () => {
  assert.deepEqual([...jobBody('friends-http-contract').matchAll(/uses: ([^\s]+)/g)].map(match => match[1]), [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  ]);
  assert.match(workflow, /- name: Preserve isolated contract evidence\n        if: always\(\)/);
  assert.match(workflow, /path: docs\/testing-evidence\/design-v2\/friends-http-ci-artifacts\n          retention-days: 7/);
});

test('hosted runner hardens only the fixed PostgreSQL share chain and control before dependencies run', () => {
  const job = jobBody('friends-http-contract');
  const repair = job.match(/- name: Restrict preinstalled PostgreSQL share permissions\n        run: \|\n([\s\S]*?)(?=      - )/)?.[1];
  assert.ok(repair, 'The observed writable PostgreSQL paths must be hardened, never accepted by a weaker trust guard.');
  assert.match(repair, /test "\$RUNNER_ENVIRONMENT" = github-hosted/);
  assert.match(repair, /test "\$ImageOS" = ubuntu24/);
  assert.match(repair, /friends_control=\/usr\/share\/postgresql\/16\/extension\/pgcrypto\.control/);
  assert.match(repair, /test -f "\$friends_control"/);
  assert.match(repair, /test ! -L "\$friends_control"/);
  assert.match(repair, /test "\$\(realpath -- "\$friends_control"\)" = "\$friends_control"/);
  assert.match(repair, /test "\$\(stat -c %u -- "\$friends_control"\)" -eq 0/);
  const directories = repair.match(/friends_share_directories=\(\n([\s\S]*?)\n          \)/)?.[1].trim().split(/\s+/);
  assert.deepEqual(directories, ['/usr/share/postgresql', '/usr/share/postgresql/16', '/usr/share/postgresql/16/extension']);
  assert.match(repair, /for friends_directory in "\$\{friends_share_directories\[@\]\}"; do/);
  assert.match(repair, /test -d "\$friends_directory"/);
  assert.match(repair, /test ! -L "\$friends_directory"/);
  assert.match(repair, /test "\$\(realpath -- "\$friends_directory"\)" = "\$friends_directory"/);
  assert.match(repair, /test "\$\(stat -c %u -- "\$friends_directory"\)" -eq 0/);
  assert.equal((repair.match(/sudo /g) || []).length, 1);
  assert.match(repair, /sudo chmod go-w -- "\$\{friends_share_directories\[@\]\}" "\$friends_control"/);
  assert.equal((repair.match(/stat -c '%n uid=%u mode=%a' -- "\$\{friends_share_directories\[@\]\}" "\$friends_control"/g) || []).length, 2);
  assert.ok(repair.indexOf('test "$RUNNER_ENVIRONMENT"') < repair.indexOf('sudo chmod'));
  assert.ok(repair.indexOf('test "$ImageOS"') < repair.indexOf('sudo chmod'));
  assert.ok(repair.indexOf('test "$(stat -c %u -- "$friends_control")" -eq 0') < repair.indexOf('sudo chmod'));
  assert.doesNotMatch(repair, /chmod -R|chown|apt|systemctl|\|\|/);
  assert.ok(job.indexOf(repair) < job.indexOf('run: npm ci'));
  const provisioner = readFileSync(new URL('./provision-isolated-friends-runtime.mjs', import.meta.url), 'utf8');
  assert.match(provisioner, /metadata\.uid === 0 && !\(metadata\.mode & 0o022\)/);
});
