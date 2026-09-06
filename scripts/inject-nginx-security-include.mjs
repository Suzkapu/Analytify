import {readFileSync, writeFileSync} from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: inject-nginx-security-include.mjs <input> <output>');
}

const includeDirective = 'include /etc/nginx/snippets/analytify-security.conf;';
const source = readFileSync(inputPath, 'utf8');
const lines = source.split('\n');
let locations = 0;
for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(/^(\s*)location\b[^{}]*\{\s*(?:#.*)?$/);
  if (!match) continue;
  locations += 1;
  if (lines[index + 1]?.trim() === includeDirective) continue;
  lines.splice(index + 1, 0, `${match[1]}  ${includeDirective}`);
  index += 1;
}
if (locations === 0) throw new Error('The Analytify virtual host has no location blocks.');
writeFileSync(outputPath, lines.join('\n'));
