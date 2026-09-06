import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const injector = resolve('scripts/inject-nginx-security-include.mjs');

function render(source) {
  const directory = mkdtempSync(join(tmpdir(), 'analytify-nginx-'));
  const input = join(directory, 'site.conf');
  const output = join(directory, 'rendered.conf');
  writeFileSync(input, source);
  const result = spawnSync(process.execPath, [injector, input, output], {encoding: 'utf8'});
  return {...result, output: result.status === 0 ? readFileSync(output, 'utf8') : ''};
}

test('security policy is installed in application and internal-redirect locations', () => {
  const result = render(`server {
  server_name analytify.dynv6.net;
  location / {
    add_header Cache-Control "no-cache";
    try_files $uri /index.html;
  }
  location = /index.html {
    add_header Cache-Control "no-store";
  }
}
`);
  assert.equal(result.status, 0);
  assert.match(result.output, /location \/ \{\n\s+server_tokens off;\n\s+include \/etc\/nginx\/snippets\/analytify-security[.]conf;/);
  assert.equal(result.output.match(/analytify-security[.]conf/g)?.length, 2);
  assert.equal(result.output.match(/server_tokens off;/g)?.length, 2);
});

test('existing includes are not duplicated while uncovered locations are repaired', () => {
  const site = `location / {
  server_tokens off;
  include /etc/nginx/snippets/analytify-security.conf;
}
location = /index.html {
  add_header Cache-Control "no-store";
}
`;
  const result = render(site);
  assert.equal(result.status, 0);
  assert.equal(result.output.match(/analytify-security[.]conf/g)?.length, 2);
  assert.equal(result.output.match(/server_tokens off;/g)?.length, 2);
});

test('an existing server_tokens directive is preserved without duplication', () => {
  const result = render(`location / {
  server_tokens off;
  try_files $uri /index.html;
}
`);
  assert.equal(result.status, 0);
  assert.equal(result.output.match(/server_tokens off;/g)?.length, 1);
  assert.equal(result.output.match(/analytify-security[.]conf/g)?.length, 1);
});

test('installer refuses to guess when the application location is missing', () => {
  const result = render('server { location /api { proxy_pass http://backend; } }\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no location blocks/);
});
