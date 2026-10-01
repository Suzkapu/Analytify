import test from 'node:test';
import assert from 'node:assert/strict';
import {enableApplicationHttp2} from './nginx-http2.mjs';

const site = `server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name analytify.dynv6.net;
  location / {
    try_files $uri /index.html;
  }
}
`;
const info = version => `nginx version: nginx/${version}\nconfigure arguments: --with-http_v2_module`;

test('modern Nginx uses one server directive and preserves nested locations', () => {
  for (const version of ['1.25.1', '1.26.0', '2.0.0']) {
    const rendered = enableApplicationHttp2(site, info(version));
    assert.equal(rendered.match(/http2 on;/g)?.length, 1);
    assert.ok(rendered.includes('listen 443 ssl;'));
    assert.ok(rendered.includes('try_files $uri /index.html;'));
    assert.equal(enableApplicationHttp2(rendered, info(version)), rendered);
  }
});

test('older Nginx enables HTTP/2 on both TLS listeners only', () => {
  const rendered = enableApplicationHttp2(site.replace('listen 443 ssl;', 'listen 80;\n  listen 443 ssl;'), info('1.24.0'));
  assert.ok(rendered.includes('listen 80;'));
  assert.equal(rendered.match(/ssl http2;/g)?.length, 2);
  assert.equal(enableApplicationHttp2(rendered, info('1.24.0')), rendered);
});

test('unknown builds, missing module, unrelated hosts and explicit settings remain untouched', () => {
  assert.equal(enableApplicationHttp2(site, ''), site);
  assert.equal(enableApplicationHttp2(site, 'nginx/1.26.0'), site);
  for (const source of [site.replace('analytify.dynv6.net', 'other-analytify.dynv6.net'),
    site.replace('server {', 'server {\n  http2 off;'), site.replace('443 ssl;', '443 ssl http2;'),
    site.replace(/ssl/g, '')]) {
    assert.equal(enableApplicationHttp2(source, info('1.26.0')), source);
  }
});

test('malformed matching server blocks fail before installation', () => {
  assert.throws(() => enableApplicationHttp2(site.slice(0, -3), info('1.26.0')), /Unterminated/);
});
