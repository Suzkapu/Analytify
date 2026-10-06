import {existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import {productionSourceInventory} from './design-v2-source-inventory.mjs';
import {applicationCoverage} from './report-worker-v8-coverage.mjs';

const rawDirectory = process.argv[2];
if (!rawDirectory) throw new Error('Provide a fresh Deno --coverage directory.');
const output = process.argv[3] || 'coverage/edge';
const cache = process.argv[4] || JSON.parse(execFileSync('deno', ['info', '--json'], {encoding: 'utf8'})).typescriptCache;
const scripts = readdirSync(rawDirectory).filter(path => path.endsWith('.json'))
  .map(path => JSON.parse(readFileSync(join(rawDirectory, path), 'utf8')));
if (!scripts.length) throw new Error('No Deno V8 execution reports found; coverage is unverified.');
const inventory = productionSourceInventory().edge;
const map = await applicationCoverage(inventory.sources, scripts.map(script => ({result: [script]})), (source, measured) => {
  const path = resolve(source);
  const emitted = join(cache, 'file', `${path}.js`);
  if (measured) {
    // Deno ranges refer to its emitted JS, not the original TypeScript. Using a
    // different compiler for executed modules would silently misplace coverage.
    if (!existsSync(emitted)) throw new Error(`Missing Deno emitted source for ${source}; coverage is unverified.`);
    const code = readFileSync(emitted, 'utf8');
    const inlineMap = code.match(/sourceMappingURL=data:application\/json;base64,([^\s]+)/);
    if (!inlineMap) throw new Error(`Missing Deno source map for ${source}.`);
    return {code, sourceMap: JSON.parse(Buffer.from(inlineMap[1], 'base64').toString('utf8'))};
  }
  // Unexecuted modules are only parsed for a zero-hit denominator, never run.
  const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
    fileName: path,
    compilerOptions: {target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, sourceMap: true, inlineSources: true}
  });
  const sourceMap = JSON.parse(compiled.sourceMapText);
  sourceMap.sources = [path];
  return {code: compiled.outputText, sourceMap};
});
mkdirSync(output, {recursive: true});
const context = libReport.createContext({dir: output, coverageMap: map});
for (const format of ['json-summary', 'json', 'lcovonly', 'html', 'text-summary']) reports.create(format).execute(context);
writeFileSync(`${output}/source-inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`);
if (map.files().length !== inventory.sources.length) throw new Error('Edge coverage denominator does not match the production-source inventory.');
