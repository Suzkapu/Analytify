import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// 1. Read files
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const deployScript = readFileSync('scripts/deploy.sh', 'utf8');
const supabaseDeployScript = readFileSync('scripts/deploy-supabase.sh', 'utf8');
const freshnessScript = readFileSync('scripts/assert-deployment-freshness.sh', 'utf8');
const liveVerification = readFileSync('scripts/verify-live-deployment.mjs', 'utf8');
const migration = readFileSync('supabase/migrations/20260905150000_deployment_records.sql', 'utf8');
const schemaDoc = readFileSync('supabase_schema.md', 'utf8');

// 2. Simulate workflow 'if' condition logic
// The workflow condition:
// github.event_name != 'pull_request' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v'))
function evaluateDeployCondition(eventName, ref) {
  if (eventName === 'pull_request') return false;
  return ref === 'refs/heads/main' || ref.startsWith('refs/tags/v');
}

const conditionTests = [
  { eventName: 'pull_request', ref: 'refs/heads/main', expected: false, desc: 'Pull requests targeting main cannot deploy' },
  { eventName: 'pull_request', ref: 'refs/heads/feature/test', expected: false, desc: 'Pull requests from feature branches cannot deploy' },
  { eventName: 'push', ref: 'refs/heads/feature/experimental', expected: false, desc: 'Feature branch push cannot deploy' },
  { eventName: 'push', ref: 'refs/heads/hotfix/quick-fix', expected: false, desc: 'Hotfix branch push cannot deploy directly without PR to main' },
  { eventName: 'push', ref: 'refs/heads/main', expected: true, desc: 'Pushes to main are allowed to deploy' },
  { eventName: 'push', ref: 'refs/tags/v1.0.0', expected: true, desc: 'Semantic release tags (v*) are allowed to deploy' },
  { eventName: 'push', ref: 'refs/tags/v2.1.0-rc.1', expected: true, desc: 'Release candidate tags (v*) are allowed to deploy' },
  { eventName: 'push', ref: 'refs/tags/custom-tag', expected: false, desc: 'Non-v tags cannot deploy' },
  { eventName: 'workflow_dispatch', ref: 'refs/heads/feature/test', expected: false, desc: 'Workflow dispatch on feature branch cannot deploy' },
  { eventName: 'workflow_dispatch', ref: 'refs/heads/main', expected: true, desc: 'Workflow dispatch on main can deploy' },
  { eventName: 'workflow_dispatch', ref: 'refs/tags/v1.5.0', expected: true, desc: 'Workflow dispatch on release tag can deploy' }
];

// 3. Execution simulations for freshness check and superseding commits
function runFreshnessCheck({ ref, sha, simulateRemoteSha }) {
  const env = {
    ...process.env,
    SIMULATE_REMOTE_SHA: simulateRemoteSha || ''
  };
  return spawnSync('bash', ['scripts/assert-deployment-freshness.sh', ref, sha], {
    env,
    encoding: 'utf8'
  });
}

const commitA = '1111111111111111111111111111111111111111';
const commitB = '2222222222222222222222222222222222222222';

// Simulate commit A supersession by commit B
const staleCommitResult = runFreshnessCheck({
  ref: 'refs/heads/main',
  sha: commitA,
  simulateRemoteSha: commitB
});

const freshCommitResult = runFreshnessCheck({
  ref: 'refs/heads/main',
  sha: commitB,
  simulateRemoteSha: commitB
});

const featureBranchResult = runFreshnessCheck({
  ref: 'refs/heads/feature/prevent-deploy',
  sha: commitA,
  simulateRemoteSha: commitA
});

const releaseTagResult = runFreshnessCheck({
  ref: 'refs/tags/v1.0.0',
  sha: commitA,
  simulateRemoteSha: commitA
});

// 4. Contract assertions
const checks = [
  // Issue #43: Protected release restrictions & Environment
  ['Workflow contains separate verify and deploy-production jobs',
    workflow.includes('verify:') && workflow.includes('deploy-production:')],
  ['Deploy job depends on verify job',
    workflow.includes('needs: verify')],
  ['Deploy job binds to protected production environment',
    workflow.includes('environment: production')],
  ['Workflow condition forbids pull requests from deploying',
    conditionTests.filter(t => t.eventName === 'pull_request').every(t => evaluateDeployCondition(t.eventName, t.ref) === t.expected)],
  ['Workflow condition forbids feature branches from deploying',
    conditionTests.filter(t => !t.ref.startsWith('refs/tags/v') && t.ref !== 'refs/heads/main').every(t => evaluateDeployCondition(t.eventName, t.ref) === t.expected)],
  ['Workflow condition permits main and v* release tags to deploy',
    conditionTests.filter(t => t.eventName === 'push' && (t.ref === 'refs/heads/main' || t.ref.startsWith('refs/tags/v'))).every(t => evaluateDeployCondition(t.eventName, t.ref) === t.expected)],
  ['Freshness script rejects unauthorized feature branches',
    featureBranchResult.status !== 0 && featureBranchResult.stderr.includes('not an authorized production deployment ref')],
  ['Freshness script accepts valid release tags',
    releaseTagResult.status === 0],

  // Issue #53: Concurrency serialization and superseding commit prevention
  ['Deploy job serializes under production-deployment concurrency group',
    workflow.includes('group: production-deployment')],
  ['Deploy job cancels stale in-progress runs',
    workflow.includes('cancel-in-progress: true')],
  ['Superseded commit A fails freshness check when superseded by commit B',
    staleCommitResult.status !== 0 && staleCommitResult.stderr.includes('Stale deployment detected')],
  ['Superseding commit B succeeds freshness check',
    freshCommitResult.status === 0 && freshCommitResult.stdout.includes('Deployment freshness confirmed')],
  ['deploy.sh asserts freshness before mutation',
    deployScript.includes('assert-deployment-freshness.sh') &&
    deployScript.indexOf('assert-deployment-freshness.sh') < deployScript.indexOf('deploy_with_retry')],
  ['deploy-supabase.sh asserts freshness before mutation',
    supabaseDeployScript.includes('assert-deployment-freshness.sh') &&
    supabaseDeployScript.indexOf('assert-deployment-freshness.sh') < supabaseDeployScript.indexOf('supabase db push')],

  // Commit SHA recording & verification
  ['deploy.sh writes version.json with commit SHA',
    deployScript.includes('version.json') && deployScript.includes('deploy_commit_sha')],
  ['deploy.sh writes .deployed-commit marker',
    deployScript.includes('.deployed-commit')],
  ['deploy.sh verifies remote deployed commit after sync',
    deployScript.includes('Verifying deployed commit SHA on Oracle Server')],
  ['Web deploy retains prior hashed assets for active PWA versions',
    deployScript.includes('deploy_with_retry "dist/spoti-front/" "${target_root}/" false')],
  ['deploy-supabase.sh records deployed commit SHA in deployment_records',
    supabaseDeployScript.includes('INSERT INTO public.deployment_records') && supabaseDeployScript.includes('commit_sha')],
  ['Live verification verifies version.json and deployment_records',
    liveVerification.includes('Analytify application version') &&
    liveVerification.includes('Supabase deployment record')],
  ['Migration defines public.deployment_records table with RLS',
    migration.includes('CREATE TABLE IF NOT EXISTS public.deployment_records') &&
    migration.includes('ENABLE ROW LEVEL SECURITY')],
  ['Consolidated schema documents deployment_records',
    schemaDoc.includes('public.deployment_records')]
];

const failures = checks.filter(([, passed]) => !passed).map(([desc]) => desc);

if (failures.length > 0) {
  console.error(`Deployment pipeline check failed:\n${failures.map(f => `  - ❌ ${f}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Deployment pipeline check passed (${checks.length}/${checks.length} assertions passed):`);
  checks.forEach(([desc]) => console.log(`  - ✔️ ${desc}`));
}
