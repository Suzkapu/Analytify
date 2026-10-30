import {readFileSync, writeFileSync} from 'node:fs';

const [, , sourcePath, destination, target] = process.argv;
if (!/^\/[A-Za-z0-9._/-]+$/.test(target || '') || target.includes('..') || target === '/') {
  throw new Error('Invalid root frontend target.');
}
const begin = '# BEGIN ANALYTIFY DEVELOPMENT PREVIEW';
const end = '# END ANALYTIFY DEVELOPMENT PREVIEW';
let source = readFileSync(sourcePath, 'utf8').replace(
  new RegExp(`^ *${begin}[\\s\\S]*?^ *${end}\\n?`, 'gm'), '');
if (source.includes(begin) || source.includes(end)) throw new Error('Incomplete preview markers.');
const lines = source.split('\n');
const targets = [];
for (let row = 0; row < lines.length; row++) {
  const match = lines[row].match(/^(\s*)server\s*\{\s*(?:#.*)?$/);
  if (!match) continue;
  let close = row + 1;
  while (close < lines.length && !lines[close].startsWith(`${match[1]}}`)) close++;
  if (close === lines.length) throw new Error('Unterminated Nginx server.');
  const block = lines.slice(row + 1, close).join('\n');
  const names = block.match(/^\s*server_name\s+([^;]+);/m)?.[1].trim().split(/\s+/) || [];
  if (names.includes('analytify.dynv6.net') && /^\s*listen\s+[^;]*\bssl\b[^;]*;/m.test(block)) {
    if (!block.split('\n').some(line => line.trim() === `root ${target};`)) {
      throw new Error('HTTPS root does not match the shared frontend target; refusing to override it.');
    }
    if (/\blocation\b[^{};]*\/new(?:\/|\s)/.test(block)) throw new Error('Unmanaged /new location.');
    targets.push({close, indent: match[1] + '  '});
  }
  row = close;
}
if (targets.length !== 1) throw new Error('Expected exactly one application HTTPS server.');
const {close, indent} = targets[0];
lines.splice(close, 0, ...[
  begin,
  'location = /new/ngsw-worker.js {',
  `  alias ${target}/assets/retire-preview-worker.js;`,
  '  include /etc/nginx/snippets/analytify-security.conf;',
  '  default_type application/javascript;',
  '  set $analytify_asset_cache_control "no-cache, no-store, must-revalidate";',
  '}',
  'location = /new {',
  '  include /etc/nginx/snippets/analytify-security.conf;',
  '  return 302 /$is_args$args;',
  '}',
  'location /new/ {',
  '  include /etc/nginx/snippets/analytify-security.conf;',
  '  rewrite ^/new/(.*)$ https://analytify.dynv6.net/$1 redirect;',
  '}',
  end
].map(line => indent + line));
writeFileSync(destination, lines.join('\n'));
