import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workflowsDir = path.join(root, '.github', 'workflows');
const workflowNames = (await readdir(workflowsDir)).filter((name) => /\.ya?ml$/.test(name));
assert.ok(workflowNames.length >= 2, 'verification and security workflows must exist');

for (const name of workflowNames) {
  const source = await readFile(path.join(workflowsDir, name), 'utf8');
  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    assert.match(
      reference,
      /^[^@\s]+@[0-9a-f]{40}$/,
      `${name} uses a mutable or invalid action reference: ${reference}`,
    );
  }
  assert.doesNotMatch(source, /pull_request_target\s*:/, `${name} must not run untrusted code with target privileges`);
}

const deploy = await readFile(path.join(workflowsDir, 'deploy.yml'), 'utf8');
assert.match(deploy, /node-version:\s*['"]24\.15\.0['"]/, 'deployment must use the supported Node runtime');
assert.match(deploy, /deploy-production:[\s\S]*environment:\s*production/, 'production secrets require the protected environment');
assert.doesNotMatch(
  deploy.slice(deploy.indexOf('  verify:'), deploy.indexOf('  deploy-production:')),
  /secrets\./,
  'untrusted verification must not access production secrets',
);

const dependabot = await readFile(path.join(root, '.github', 'dependabot.yml'), 'utf8');
assert.match(dependabot, /package-ecosystem:\s*npm/g);
assert.match(dependabot, /package-ecosystem:\s*github-actions/);

const security = await readFile(path.join(workflowsDir, 'security.yml'), 'utf8');
assert.match(security, /dependency-review-action/);
assert.match(security, /codeql-action\/analyze/);
assert.match(security, /npm audit --audit-level=high/);
assert.match(security, /npm sbom --sbom-format=cyclonedx/);

const policy = await readFile(path.join(root, 'docs', 'supply-chain-policy.md'), 'utf8');
assert.match(policy, /Owner \| Expiry/);
assert.match(policy, /2026-12-31/);

console.log(`Supply-chain policy check passed (${workflowNames.length} workflows, immutable action pins).`);
