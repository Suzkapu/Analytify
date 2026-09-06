import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const root = new URL('../src/app/', import.meta.url);

function htmlFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? htmlFiles(path)
      : (name.endsWith('.html') ? [path] : []);
  });
}

const failures = [];
for (const file of htmlFiles(root.pathname)) {
  const source = readFileSync(file, 'utf8');
  const modalTags = [...source.matchAll(/<(?:section|div)\b[^>]*aria-modal="true"[^>]*>/gs)];
  for (const [index, match] of modalTags.entries()) {
    const tag = match[0];
    const start = match.index;
    const line = source.slice(0, start).split('\n').length;
    const missing = [
      ['appAccessibleDialog', /\bappAccessibleDialog\b/],
      ['accessible name', /aria-labelledby=|aria-label=/],
      ['accessible description', /aria-describedby=/],
      ['Escape policy', /\(modalEscape\)=|\[modalEscapeDisabled\]=/]
    ].filter(([, pattern]) => !pattern.test(tag)).map(([label]) => label);
    if (missing.length) failures.push(`${file}:${line} missing ${missing.join(', ')}`);

    const modalMarkup = source.slice(start, modalTags[index + 1]?.index ?? source.length);
    if (!/\bappModalInitialFocus\b/.test(modalMarkup)) {
      failures.push(`${file}:${line} missing a safe initial-focus control`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('All custom modals use the shared accessible dialog behavior.');
