import {readFileSync, writeFileSync} from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: inject-nginx-security-include.mjs <input> <output>');
}

const includeDirective = 'include /etc/nginx/snippets/analytify-security.conf;';
const serverTokensDirective = 'server_tokens off;';
const source = readFileSync(inputPath, 'utf8');
const lines = source.split('\n');
let locations = 0;
for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(/^(\s*)location\b[^{}]*\{\s*(?:#.*)?$/);
  if (!match) continue;
  locations += 1;
  const locationIndent = `${match[1]}  `;
  let closingIndex = index + 1;
  while (closingIndex < lines.length && !lines[closingIndex].startsWith(`${match[1]}}`)) {
    closingIndex += 1;
  }
  const locationLines = lines.slice(index + 1, closingIndex).map(line => line.trim());
  const directives = [];
  if (!locationLines.includes(serverTokensDirective)) directives.push(`${locationIndent}${serverTokensDirective}`);
  if (!locationLines.includes(includeDirective)) directives.push(`${locationIndent}${includeDirective}`);
  if (directives.length === 0) continue;
  lines.splice(index + 1, 0, ...directives);
  index += directives.length;
}
if (locations === 0) throw new Error('The Analytify virtual host has no location blocks.');
writeFileSync(outputPath, lines.join('\n'));
