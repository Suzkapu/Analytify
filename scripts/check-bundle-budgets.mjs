import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const output = new URL('../dist/spoti-front/', import.meta.url).pathname;
const files = readdirSync(output);
const bytes = name => statSync(join(output, name)).size;
const find = prefix => files.find(name => (name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`))
  && name.endsWith('.js'));
const failures = [];

const main = find('main');
const styles = files.find(name => (name.startsWith('styles.') || name.startsWith('styles-')) && name.endsWith('.css'));
if (!styles || bytes(styles) > 300_000) failures.push(`global styles are ${styles ? bytes(styles) : 'missing'} bytes (limit 300000)`);

const initialNames = new Set([main, find('polyfills'), find('runtime')].filter(Boolean));
const pending = [...initialNames];
while (pending.length) {
  const file = pending.pop();
  const source = readFileSync(join(output, file), 'utf8');
  const staticImports = [
    ...source.matchAll(/\bfrom\s*["'][.]\/([^"']+[.]js)["']/g),
    ...source.matchAll(/\bimport\s*["'][.]\/([^"']+[.]js)["']/g)
  ].map(match => match[1]);
  for (const dependency of staticImports) {
    if (!files.includes(dependency) || initialNames.has(dependency)) continue;
    initialNames.add(dependency);
    pending.push(dependency);
  }
}
const initialBytes = [...initialNames].reduce((total, file) => total + bytes(file), 0);
if (!main || initialBytes > 850_000) {
  failures.push(`initial JavaScript is ${main ? initialBytes : 'missing'} bytes (limit 850000)`);
}
for (const file of files.filter(name => name.endsWith('.js') && !initialNames.has(name))) {
  if (bytes(file) > 110_000) failures.push(`lazy chunk ${file} is ${bytes(file)} bytes (limit 110000)`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Initial JavaScript (${initialBytes} bytes), styles, and every lazy chunk stay within budgets.`);
