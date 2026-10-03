import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

function files(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const sources = files('src');
const previewFiles = sources.filter(path => /(?:design-v2|\/ui-v2\/|\/v2-|\/ambient\/)/.test(path));
assert.deepEqual(previewFiles, [], 'Preview presentation belongs only on the development branch.');
const previewImports = sources.filter(path => /\.(?:ts|scss|html)$/.test(path)
  && /(?:DesignV2|\.design-v2|@shared\/ui-v2|v2-color-)/.test(readFileSync(path, 'utf8')));
assert.deepEqual(previewImports, [], 'Stable code must not import or embed the preview presentation.');
assert.match(readFileSync('src/app/app-routing.module.ts', 'utf8'), /component: AppShellComponent/);
const worker = JSON.parse(readFileSync('ngsw-config.json', 'utf8'));
assert.ok(worker.navigationUrls.includes('!/new/**'), 'The stable worker must not capture preview navigation.');
console.log('Stable release contains no preview presentation and leaves preview navigation uncached.');
