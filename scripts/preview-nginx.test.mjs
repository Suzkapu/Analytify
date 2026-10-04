import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPreviewNginx} from './preview-nginx.mjs';

const source = `server {
  listen 80;
  server_name analytify.dynv6.net;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  server_name analytify.dynv6.net;
  location / {
    root /var/www/stable;
    try_files $uri $uri/ /index.html;
  }
}
`;
const root = '/var/www/analytify-preview';
test('adds only preview locations and preserves the stable root and redirect', () => {
  const result = renderPreviewNginx(source, root);
  assert.ok(result.includes('root /var/www/stable;'));
  assert.ok(result.includes('return 301 https://$host$request_uri;'));
  assert.ok(result.includes('try_files $uri $uri/ /new/index.html;'));
  assert.ok(result.includes('try_files $uri =404;'));
  assert.equal(result.match(/location \^~ \/new\//g)?.length, 1);
  assert.equal(renderPreviewNginx(result, root), result);
});
test('rejects ambiguous hosts, unmanaged routes and unsafe roots', () => {
  assert.throws(() => renderPreviewNginx(source + source, root));
  assert.throws(() => renderPreviewNginx(source.replace('location / {', 'location /new/ {'), root));
  for (const invalid of ['/', '/var/www/stable', '/var/www/../analytify-preview', '/var/www/analytify-preview;']) {
    assert.throws(() => renderPreviewNginx(source, invalid));
  }
});
test('immutable preview caching matches only content-hashed assets, never mutable metadata', () => {
  const result = renderPreviewNginx(source, root);
  // Quantifier braces must remain inside quotes, or Nginx treats them as blocks.
  const pattern = result.match(/location ~ "(\^\/new\/[^"\n]+)" \{/)[1];
  const expression = new RegExp(pattern);
  for (const path of ['/new/main-62CF5IFV.js', '/new/chunk-wzYwz1Vg.js', '/new/styles-GJ4RSZKV.css', '/new/media/primeicons-VZW3FIZ4.woff2']) {
    assert.equal(expression.test(path), true, path);
  }
  for (const path of ['/main-62CF5IFV.js', '/new/version.json', '/new/ngsw.json', '/new/ngsw-worker.js', '/new/index.html', '/new/manifest.webmanifest', '/new/main.js', '/new/assets/Analytify-384.webp']) {
    assert.equal(expression.test(path), false, path);
  }
  assert.match(result, /set \$analytify_asset_cache_control "public, max-age=31536000, immutable"/);
});
test('the preview deployment does not deploy the production backend or worker', () => {
  const workflow = readFileSync('.github/workflows/preview.yml', 'utf8');
  const deploy = readFileSync('scripts/deploy-preview.sh', 'utf8');
  assert.match(workflow, /codex\/design-v2/);
  assert.doesNotMatch(workflow + deploy, /SUPABASE_SERVICE_ROLE_KEY|SPOTIFY_CLIENT_SECRET|deploy-supabase\.sh|scripts\/deploy\.sh|activate-release\.sh/);
  assert.match(deploy, /refs\/heads\/codex\/design-v2/);
  assert.match(deploy, /StrictHostKeyChecking=yes/);
  const app = readFileSync('src/app/app.module.ts', 'utf8');
  const angular = JSON.parse(readFileSync('angular.json', 'utf8'));
  assert.equal(angular.projects.SpotiFront.architect.build.options.baseHref, '/new/');
  assert.match(app, /register\('\/new\/ngsw-worker\.js'/);
  assert.match(app, /scope: '\/new\/'/);
});
