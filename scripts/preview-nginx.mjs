import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const begin = '# BEGIN ANALYTIFY DEVELOPMENT PREVIEW';
const end = '# END ANALYTIFY DEVELOPMENT PREVIEW';

export function renderPreviewNginx(source, root) {
  if (!/^\/[A-Za-z0-9._/-]+\/analytify-preview$/.test(root) || root.includes('..')) {
    throw new Error('Invalid dedicated preview root.');
  }
  const markers = new RegExp(`^ *${begin}[\\s\\S]*?^ *${end}\\n?`, 'gm');
  const clean = source.replace(markers, '');
  if (clean.includes(begin) || clean.includes(end)) throw new Error('Incomplete preview markers.');
  const lines = clean.split('\n');
  const targets = [];
  for (let row = 0; row < lines.length; row++) {
    const match = lines[row].match(/^(\s*)server\s*\{\s*(?:#.*)?$/);
    if (!match) continue;
    let close = row + 1;
    while (close < lines.length && !lines[close].startsWith(`${match[1]}}`)) close++;
    if (close === lines.length) throw new Error('Unterminated Nginx server block.');
    const block = lines.slice(row + 1, close).join('\n');
    const names = block.match(/^\s*server_name\s+([^;]+);/m)?.[1].trim().split(/\s+/) || [];
    if (names.includes('analytify.dynv6.net') && /^\s*listen\s+[^;]*\bssl\b[^;]*;/m.test(block)) {
      if (/\blocation\b[^{};]*\/new(?:\/|\s)/.test(block)) throw new Error('An unmanaged /new location already exists.');
      targets.push({close, indent: match[1] + '  '});
    }
    row = close;
  }
  if (targets.length !== 1) throw new Error('Expected exactly one Analytify HTTPS server.');
  const {close, indent} = targets[0];
  const config = [
    begin,
    'location = /new {',
    '  include /etc/nginx/snippets/analytify-security.conf;',
    '  return 308 /new/;',
    '}',
    'location ^~ /new/ {',
    `  root ${root};`,
    '  include /etc/nginx/snippets/analytify-security.conf;',
    '  try_files $uri $uri/ /new/index.html;',
    '  location ~ "^/new/(?:(?:main|polyfills|runtime|styles|chunk)[.-][A-Za-z0-9_-]{8,}[.](?:js|css)|media/[A-Za-z0-9_-]+-[A-Za-z0-9]{8,}[.](?:woff2|woff|ttf))$" {',
    '    include /etc/nginx/snippets/analytify-security.conf;',
    '    set $analytify_asset_cache_control "public, max-age=31536000, immutable";',
    '    try_files $uri =404;',
    '  }',
    '  location ~* \\.(?:js|css|json|woff2?|ttf|otf|ico|png|jpe?g|webp|avif|svg|webmanifest)$ {',
    '    include /etc/nginx/snippets/analytify-security.conf;',
    '    try_files $uri =404;',
    '  }',
    '}',
    end
  ].map(line => indent + line);
  lines.splice(close, 0, ...config);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , source, destination, root] = process.argv;
  if (!source || !destination || !root) throw new Error('Usage: preview-nginx.mjs source destination dedicated-preview-root');
  writeFileSync(destination, renderPreviewNginx(readFileSync(source, 'utf8'), root));
}
