import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invalidSecurityHeaders} from './security-headers.mjs';
import {hashedMainAsset, hasImmutableAssetCaching, hasMutableMetadataCaching} from './asset-cache-policy.mjs';

test('live cache validation rejects stale metadata and conflicting asset directives', () => {
  assert.equal(hashedMainAsset('<script type="module" src="main-ABCDEFGH.js"></script>'), 'main-ABCDEFGH.js');
  for (const src of ['main.js', 'https://evil.test/main-ABCDEFGH.js', '//evil.test/main-ABCDEFGH.js', '../main-ABCDEFGH.js']) {
    assert.equal(hashedMainAsset(`<script src="${src}"></script>`), null);
  }
  const immutable = new Headers({'cache-control': 'public, max-age=31536000, immutable'});
  assert.equal(hasImmutableAssetCaching(immutable), true);
  assert.equal(hasMutableMetadataCaching(immutable), false);
  for (const value of ['', 'public, max-age=60', 'public, max-age=31536000, immutable, no-cache',
    'private, max-age=31536000, immutable',
    'public, max-age=31536000, immutable, max-age=60',
    'public, max-age=31536000, immutable, private="Authorization"']) {
    assert.equal(hasImmutableAssetCaching(new Headers({'cache-control': value})), false);
  }
  for (const value of ['', 'no-cache', 'no-store', 'max-age=0']) {
    assert.equal(hasMutableMetadataCaching(new Headers({'cache-control': value})), true);
  }
  for (const value of ['max-age="60"', 'max-age = 60', 's-maxage=60', 'max-age=garbage']) {
    assert.equal(hasMutableMetadataCaching(new Headers({'cache-control': value})), false, value);
  }
});

const nginx = readFileSync('deploy/analytify-security.conf', 'utf8');
const cachePolicy = readFileSync('deploy/analytify-asset-cache.conf', 'utf8');

test('immutable caching matches only successful hashed build assets', () => {
  assert.match(cachePolicy, /map "\$status:\$uri" \$analytify_asset_cache_control/);
  assert.match(cachePolicy, /default "";/);
  const patterns = [...cachePolicy.matchAll(/"~([^"]+)" "public, max-age=31536000, immutable";/g)]
    .map(match => new RegExp(match[1]));
  assert.equal(patterns.length, 2);
  const matches = value => patterns.some(pattern => pattern.test(value));
  for (const uri of ['/main-XLPVQTE3.js', '/chunk-D8loj07s.js', '/styles-IDQ5UDPB.css',
    '/main.123456abcdef.js', '/media/primeicons-VZW3FIZ4.woff2']) {
    assert.equal(matches(`200:${uri}`), true, uri);
    assert.equal(matches(`404:${uri}`), false, uri);
    assert.equal(matches(`500:${uri}`), false, uri);
  }
  for (const uri of ['/', '/index.html', '/login', '/ngsw.json', '/ngsw-worker.js',
    '/safety-worker.js', '/version.json', '/manifest.webmanifest', '/main.js',
    '/main-short.js', '/api/chunk-D8loj07s.js', '/assets/Analytify-384.webp',
    '/media/primeicons.woff2', '/chunk-D8loj07sXjs', '/main-XLPVQTE3.js/extra']) {
    assert.equal(matches(`200:${uri}`), false, uri);
  }
  assert.match(nginx, /add_header Cache-Control \$analytify_asset_cache_control;/);
});

test('static application assets negotiate gzip without enabling API JSON compression', () => {
  assert.match(nginx, /^gzip on;$/m);
  assert.match(nginx, /^gzip_vary on;$/m);
  assert.match(nginx, /^gzip_min_length 1024;$/m);
  assert.match(nginx, /^gzip_comp_level 5;$/m);
  const types = nginx.match(/^gzip_types ([^;]+);$/m)?.[1].split(/\s+/);
  assert.deepEqual(types, ['text/css', 'application/javascript', 'application/wasm']);
});
const deploy = readFileSync('scripts/deploy.sh', 'utf8');
const installer = readFileSync('scripts/install-nginx-security.sh', 'utf8');
const liveVerification = readFileSync('scripts/verify-live-deployment.mjs', 'utf8');
const serviceWorker = JSON.parse(readFileSync('ngsw-config.json', 'utf8'));

test('cache policy is commit-scoped during transport and restored with nginx configuration', () => {
  assert.match(deploy, /deploy_private_file_with_retry "deploy\/analytify-asset-cache[.]conf"/);
  assert.match(deploy, /[.]analytify-nginx-cache-\$\{deploy_commit_sha\}[.]conf/);
  assert.match(installer, /cache_source="\$\{2:-/);
  assert.match(installer, /if \[\[ "\$had_cache" == true \]\]; then/);
  assert.match(installer, /if \[\[ "\$cache_changed" == true \]\]; then/);
  assert.match(installer, /install -o root -g root -m 0644 "\$cache_backup" "\$cache_file"/);
  assert.match(installer, /install -o root -g root -m 0644 "\$cache_source" "\$cache_file"/);
});

test('versioned nginx configuration supplies the required browser defenses', () => {
  const headers = new Headers();
  for (const match of nginx.matchAll(/add_header\s+([^\s]+)\s+"([^"]+)"\s+always;/g)) {
    headers.set(match[1], match[2]);
  }
  assert.deepEqual(invalidSecurityHeaders(headers), []);
  assert.doesNotMatch(nginx, /server_tokens off;/);
  assert.doesNotMatch(nginx, /script-src[^;]*'unsafe-inline'/);
  assert.match(nginx, /frame-ancestors 'none'/);
  assert.match(nginx, /connect-src[^;]*https:\/\/\*[.]scdn[.]co/);
  assert.match(nginx, /connect-src[^;]*https:\/\/\*[.]spotifycdn[.]com/);
  assert.match(nginx, /connect-src[^;]*https:\/\/platform-lookaside[.]fbsbx[.]com/);
  assert.match(nginx, /Cross-Origin-Opener-Policy\s+"same-origin"\s+always/);
  assert.match(nginx, /Cross-Origin-Resource-Policy\s+"same-origin"\s+always/);
  assert.doesNotMatch(nginx, /Cross-Origin-Embedder-Policy/);
  assert.match(deploy, /install-nginx-security[.]sh/);
  assert.match(installer, /nginx -t/);
  assert.match(installer, /restore_previous/);
  assert.match(installer, /nginx\/snippets\/analytify-security[.]conf/);
  assert.match(installer, /inject-nginx-security-include[.]mjs/);
  assert.match(readFileSync('scripts/inject-nginx-security-include.mjs', 'utf8'), /server_tokens off;/);
  assert.match(liveVerification, /invalidSecurityHeaders\(response[.]headers\)/);
});

test('live validation reports missing or weakened headers', () => {
  const headers = new Headers({'X-Content-Type-Options': 'nosniff', Server: 'nginx/1.24.0'});
  assert.ok(invalidSecurityHeaders(headers).includes('content-security-policy'));
  assert.ok(invalidSecurityHeaders(headers).includes('strict-transport-security'));
  assert.ok(invalidSecurityHeaders(headers).includes('cross-origin-opener-policy'));
  assert.ok(invalidSecurityHeaders(headers).includes('cross-origin-resource-policy'));
  assert.ok(invalidSecurityHeaders(headers).includes('server-version'));
});

test('online PWA navigations refresh response security headers from the server', () => {
  assert.equal(serviceWorker.navigationRequestStrategy, 'freshness');
});
