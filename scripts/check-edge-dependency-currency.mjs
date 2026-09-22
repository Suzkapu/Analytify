import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const functionsRoot = path.join(root, 'supabase', 'functions');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const declaredSupabase = packageJson.dependencies?.['@supabase/supabase-js'];
const versionMatch = String(declaredSupabase || '').match(/(\d+\.\d+\.\d+)/);

assert.ok(versionMatch, 'package.json must declare a concrete @supabase/supabase-js version');
const expectedSupabaseVersion = versionMatch[1];
const directImports = [];

async function visit(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(target);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const source = await readFile(target, 'utf8');
    for (const match of source.matchAll(/(?:npm:|https:\/\/esm\.sh\/)@supabase\/supabase-js@(\d+\.\d+\.\d+)/g)) {
      directImports.push({file: path.relative(root, target), specifier: match[0], version: match[1]});
    }
  }
}

await visit(functionsRoot);
assert.ok(directImports.length > 0, 'at least one Edge Function Supabase import must be found');

for (const dependency of directImports) {
  assert.ok(
    dependency.specifier.startsWith('npm:'),
    `${dependency.file} must use the supported npm: Supabase import instead of a remote CDN`,
  );
  assert.equal(
    dependency.version,
    expectedSupabaseVersion,
    `${dependency.file} uses Supabase ${dependency.version}; expected ${expectedSupabaseVersion}`,
  );
}

const denoLock = JSON.parse(await readFile(path.join(functionsRoot, 'deno.lock'), 'utf8'));
assert.ok(
  denoLock.specifiers?.[`npm:@supabase/supabase-js@${expectedSupabaseVersion}`],
  `deno.lock must contain npm:@supabase/supabase-js@${expectedSupabaseVersion}`,
);

if (process.argv.includes('--online')) {
  await auditDenoRuntime();
}

console.log(
  `Edge dependency check passed (${directImports.length} imports, Supabase ${expectedSupabaseVersion}).`,
);

async function auditDenoRuntime() {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
  const pinnedMatch = workflow.match(/deno-version:\s*v?(\d+\.\d+\.\d+)/);
  assert.ok(pinnedMatch, 'deploy.yml must pin a concrete Deno runtime version');

  const releaseResponse = await fetch('https://api.github.com/repos/denoland/deno/releases/latest', {
    headers: {'Accept': 'application/vnd.github+json', 'User-Agent': 'analytify-dependency-audit'},
  });
  assert.equal(releaseResponse.ok, true, `Deno release lookup failed with ${releaseResponse.status}`);
  const release = await releaseResponse.json();
  const latestMatch = String(release.tag_name || '').match(/v?(\d+\.\d+\.\d+)/);
  assert.ok(latestMatch, 'latest stable Deno release did not contain a semantic version');

  const current = pinnedMatch[1];
  const latest = latestMatch[1];
  if (compareVersions(latest, current) <= 0) return;

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  assert.ok(token && repository, 'online audit requires GITHUB_TOKEN and GITHUB_REPOSITORY');

  const title = `[Dependencies] Review Deno runtime ${latest}`;
  const body = [
    `The weekly dependency audit found Deno ${latest}; CI and Edge checks currently use ${current}.`,
    '',
    `Release: ${release.html_url}`,
    '',
    'Review checklist:',
    '- document relevant breaking changes and the upgrade rationale',
    '- confirm compatibility with the hosted Supabase Edge Runtime',
    '- update the pinned CI runtime and regenerate `supabase/functions/deno.lock`',
    '- run Edge Function checks plus the complete verification workflow',
    '- record a rollback version before merging',
  ].join('\n');

  const apiBase = `https://api.github.com/repos/${repository}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'analytify-dependency-audit',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const issuesResponse = await fetch(`${apiBase}/issues?state=open&per_page=100`, {headers});
  assert.equal(issuesResponse.ok, true, `open issue lookup failed with ${issuesResponse.status}`);
  const existing = (await issuesResponse.json()).find(
    (issue) => !issue.pull_request && String(issue.title).startsWith('[Dependencies] Review Deno runtime '),
  );
  if (existing?.title === title) return;
  const target = existing ? `${apiBase}/issues/${existing.number}` : `${apiBase}/issues`;
  const writeResponse = await fetch(target, {
    method: existing ? 'PATCH' : 'POST',
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify({title, body}),
  });
  assert.equal(writeResponse.ok, true, `dependency review issue write failed with ${writeResponse.status}`);
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
