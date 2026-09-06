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
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /group: analytify-production\s*\n\s+cancel-in-progress: true/);
  assert.match(workflow, /DEPLOY_COMMIT_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /EXPECTED_COMMIT_SHA: \$\{\{ github\.sha \}\}/);
});

test('each deployment script checks freshness before its first remote mutation', () => {
  const oracleGate = deployScript.indexOf('assert-deployment-freshness.sh');
  const oracleMutation = deployScript.indexOf('mkdir -p');
  assert.ok(oracleGate > 0 && oracleGate < oracleMutation);

  const supabaseGate = supabaseScript.indexOf('assert-deployment-freshness.sh');
  const supabaseMutation = supabaseScript.indexOf('supabase link');
  assert.ok(supabaseGate > 0 && supabaseGate < supabaseMutation);
});
