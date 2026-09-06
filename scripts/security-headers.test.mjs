import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invalidSecurityHeaders} from './security-headers.mjs';

const nginx = readFileSync('deploy/analytify-security.conf', 'utf8');
const deploy = readFileSync('scripts/deploy.sh', 'utf8');
const installer = readFileSync('scripts/install-nginx-security.sh', 'utf8');
const liveVerification = readFileSync('scripts/verify-live-deployment.mjs', 'utf8');

test('versioned nginx configuration supplies the required browser defenses', () => {
  const headers = new Headers();
  for (const match of nginx.matchAll(/add_header\s+([^\s]+)\s+"([^"]+)"\s+always;/g)) {
    headers.set(match[1], match[2]);
  }
  assert.deepEqual(invalidSecurityHeaders(headers), []);
  assert.match(nginx, /server_tokens off;/);
  assert.doesNotMatch(nginx, /script-src[^;]*'unsafe-inline'/);
  assert.match(nginx, /frame-ancestors 'none'/);
  assert.match(deploy, /install-nginx-security[.]sh/);
  assert.match(installer, /nginx -t/);
  assert.match(installer, /restore_previous/);
  assert.match(liveVerification, /invalidSecurityHeaders\(response[.]headers\)/);
});

test('live validation reports missing or weakened headers', () => {
  const headers = new Headers({'X-Content-Type-Options': 'nosniff', Server: 'nginx/1.24.0'});
  assert.ok(invalidSecurityHeaders(headers).includes('content-security-policy'));
  assert.ok(invalidSecurityHeaders(headers).includes('strict-transport-security'));
  assert.ok(invalidSecurityHeaders(headers).includes('server-version'));
});
