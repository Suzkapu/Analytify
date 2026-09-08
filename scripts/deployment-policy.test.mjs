import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const deployScript = readFileSync('scripts/deploy.sh', 'utf8');
const supabaseScript = readFileSync('scripts/deploy-supabase.sh', 'utf8');

test('only main can start a production deployment', () => {
  assert.match(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/);
  assert.match(workflow, /deploy-production:\s*[\s\S]*?if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
});

test('verification is secret-free and production secrets are environment scoped', () => {
  const [beforeProduction, productionJob] = workflow.split(/\n  deploy-production:/);
  assert.ok(beforeProduction);
  assert.ok(productionJob);
  assert.doesNotMatch(beforeProduction, /secrets\./);
  assert.match(productionJob, /secrets\.SUPABASE_ACCESS_TOKEN/);
  assert.match(productionJob, /secrets\.SSH_PRIVATE_KEY/);
});

test('verified build is handed to a serialized cancelable production job', () => {
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /group: analytify-production\s*\n\s+cancel-in-progress: true/);
  assert.match(workflow, /DEPLOY_COMMIT_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA: \$\{\{ github\.sha \}\}/);
});

test('the exact tested worker is digested and deployed without registry access', () => {
  assert.match(workflow, /Assemble and retest the exact production worker/);
  assert.match(workflow, /npm run sync-service:check/);
  assert.match(workflow, /npm sbom --prefix services\/sync-service --omit=dev --sbom-format=cyclonedx/);
  assert.match(workflow, /sha256sum analytify-worker\.tar\.gz analytify-worker\.cdx\.json/);
  assert.match(workflow, /name: analytify-worker-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /sha256sum --check analytify-worker\.sha256/);
  assert.match(workflow, /WORKER_ARTIFACT_DIR: \$\{\{ github\.workspace \}\}/);
  assert.doesNotMatch(deployScript, /npm (?:ci|install)/);
  assert.doesNotMatch(deployScript, /--exclude=\/?node_modules/);
});

test('CI declares and installs one exact package-manager release', () => {
  assert.match(workflow, /NPM_VERSION: 12\.0\.2/);
  assert.match(workflow, /npm install --global "npm@\$\{NPM_VERSION\}"/);
});

test('production waits for same-commit advisory and CodeQL gates', () => {
  assert.match(workflow, /security-advisories:[\s\S]*npm audit --audit-level=high/);
  assert.match(workflow, /codeql:[\s\S]*github\/codeql-action\/analyze@[0-9a-f]{40}/);
  assert.match(workflow, /deploy-production:\s*\n\s+needs: \[verify, security-advisories, codeql\]/);
});

test('each deployment script checks freshness before its first remote mutation', () => {
  const oracleGate = deployScript.indexOf('assert-deployment-freshness.sh');
  const oracleMutation = deployScript.indexOf('mkdir -p');
  assert.ok(oracleGate > 0 && oracleGate < oracleMutation);

  const supabaseGate = supabaseScript.indexOf('assert-deployment-freshness.sh');
  const supabaseMutation = supabaseScript.indexOf('supabase link');
  assert.ok(supabaseGate > 0 && supabaseGate < supabaseMutation);
});

test('Oracle identity is pinned and verified before Supabase can mutate production', () => {
  assert.doesNotMatch(workflow, /StrictHostKeyChecking=accept-new/);
  assert.doesNotMatch(deployScript, /StrictHostKeyChecking=accept-new/);
  assert.match(deployScript, /StrictHostKeyChecking=yes/);
  assert.match(deployScript, /UserKnownHostsFile=/);
  assert.match(deployScript, /require_value DEPLOY_SSH_KNOWN_HOSTS/);

  const oraclePreflight = workflow.indexOf('Verify pinned Oracle SSH identity before any mutation');
  const supabaseMutation = workflow.indexOf('Deploy Supabase schema and functions');
  assert.ok(oraclePreflight > 0 && oraclePreflight < supabaseMutation);
  assert.match(workflow, /DEPLOY_SSH_KNOWN_HOSTS: \$\{\{ secrets\.ORACLE_SSH_KNOWN_HOSTS \}\}/);
});
