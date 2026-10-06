import {readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {mergeProcessCovs} from '@bcoe/v8-coverage';
import convert from 'ast-v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import {parseAstAsync} from 'vitest/node';
import {productionSourceInventory} from './design-v2-source-inventory.mjs';

// Uses the same AST-aware V8 converter as the frontend provider. Sources are
// parsed, never imported: absent worker entrypoints cannot contact a real service.
export async function applicationCoverage(sources, processReports, loadRuntimeSource = source => ({code: readFileSync(source, 'utf8')})) {
  if (!processReports.length) throw new Error('No V8 execution reports found; coverage is unverified.');
  const merged = mergeProcessCovs(processReports);
  const map = libCoverage.createCoverageMap({});
  for (const source of sources) {
    const url = pathToFileURL(resolve(source)).href;
    const measured = merged.result.find(script => script.url === url);
    const {code, sourceMap} = loadRuntimeSource(source, !!measured);
    const coverage = measured || {
      url, functions: [{functionName: '', isBlockCoverage: true,
        ranges: [{startOffset: 0, endOffset: code.length, count: 0}]}]
    };
    map.merge(await convert({code, sourceMap, ast: parseAstAsync(code), coverage}));
  }
  return map;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawDirectory = process.argv[2];
  if (!rawDirectory) throw new Error('Provide the NODE_V8_COVERAGE directory from a fresh worker test run.');
  const output = process.argv[3] || 'coverage/worker';
  const processReports = readdirSync(rawDirectory).filter(path => path.endsWith('.json'))
    .map(path => JSON.parse(readFileSync(`${rawDirectory}/${path}`, 'utf8')));
  const inventory = productionSourceInventory().worker;
  const map = await applicationCoverage(inventory.sources, processReports);
  mkdirSync(output, {recursive: true});
  const context = libReport.createContext({dir: output, coverageMap: map});
  for (const format of ['json-summary', 'json', 'lcovonly', 'html', 'text-summary']) reports.create(format).execute(context);
  writeFileSync(`${output}/source-inventory.json`, `${JSON.stringify(inventory, null, 2)}\n`);
  if (map.files().length !== inventory.sources.length) throw new Error('Coverage denominator does not match the production-source inventory.');
}
