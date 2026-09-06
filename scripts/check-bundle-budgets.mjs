import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const output = new URL('../dist/spoti-front/', import.meta.url).pathname;
const files = readdirSync(output);
const bytes = name => statSync(join(output, name)).size;
const find = prefix => files.find(name => name.startsWith(prefix) && name.endsWith('.js'));
const failures = [];

const main = find('main.');
const styles = files.find(name => name.startsWith('styles.') && name.endsWith('.css'));
if (!main || bytes(main) > 850_000) failures.push(`main bundle is ${main ? bytes(main) : 'missing'} bytes (limit 850000)`);
if (!styles || bytes(styles) > 300_000) failures.push(`global styles are ${styles ? bytes(styles) : 'missing'} bytes (limit 300000)`);

const initialNames = new Set([main, find('polyfills.'), find('runtime.')].filter(Boolean));
for (const file of files.filter(name => name.endsWith('.js') && !initialNames.has(name))) {
  if (bytes(file) > 110_000) failures.push(`lazy chunk ${file} is ${bytes(file)} bytes (limit 110000)`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Initial assets and every lazy route stay within their transfer/parse budgets.');
