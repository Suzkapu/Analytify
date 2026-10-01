// Support both the modern server directive and older supported listen syntax.
export function enableApplicationHttp2(source, buildInfo) {
  const version = buildInfo.match(/nginx\/(\d+)\.(\d+)\.(\d+)/);
  if (!version || !buildInfo.includes('--with-http_v2_module')) return source;
  const [, major, minor, patch] = version.map(Number);
  const modern = major > 1 || (major === 1 && (minor > 25 || (minor === 25 && patch >= 1)));
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(\s*)server\s*\{\s*(?:#.*)?$/);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length && !lines[end].startsWith(`${match[1]}}`)) end++;
    if (end === lines.length) throw new Error('Unterminated Nginx server block.');
    const block = lines.slice(index + 1, end).join('\n');
    const names = block.match(/^\s*server_name\s+([^;]+);/m)?.[1].trim().split(/\s+/) || [];
    if (!names.includes('analytify.dynv6.net')
      || !/^\s*listen\s+[^;]*\bssl\b[^;]*;/m.test(block)
      || /^\s*http2\s+(?:on|off)\s*;/m.test(block)
      || /^\s*listen\s+[^;]*\bhttp2\b[^;]*;/m.test(block)) continue;
    if (modern) {
      lines.splice(index + 1, 0, `${match[1]}  http2 on;`);
      index = end + 1;
    } else {
      for (let row = index + 1; row < end; row++) {
        if (/^\s*listen\s+[^;]*\bssl\b[^;]*;/.test(lines[row]) && !/\bhttp2\b/.test(lines[row].split('#')[0])) {
          lines[row] = lines[row].replace(';', ' http2;');
        }
      }
      index = end;
    }
  }
  return lines.join('\n');
}
