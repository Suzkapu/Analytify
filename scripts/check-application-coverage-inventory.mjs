import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {productionSourceInventory} from './design-v2-source-inventory.mjs';

const suite = process.argv[2] || 'frontend';
const inventory = productionSourceInventory()[suite];
if (!inventory) throw new Error('Choose frontend, worker or edge.');
const directory = suite === 'frontend' ? 'SpotiFront' : suite;
const summary = JSON.parse(readFileSync(`coverage/${directory}/coverage-summary.json`, 'utf8'));
const missing = inventory.sources.filter(source => !summary[resolve(source)]);
if (missing.length) throw new Error(`Production sources missing from ${suite} coverage:\n${missing.join('\n')}`);
for (const metric of ['lines', 'statements', 'functions', 'branches']) {
  if (typeof summary.total?.[metric]?.pct !== 'number') throw new Error(`Missing ${suite} ${metric} coverage.`);
  const target = process.argv.includes('--final') ? 98 : null;
  if (target && summary.total[metric].pct < target) throw new Error(`${suite} ${metric}: ${summary.total[metric].pct}% < ${target}%`);
}
console.log(`${suite}: all ${inventory.sources.length} production sources included${process.argv.includes('--final') ? '; every metric meets 98%' : '; final 98% gate not requested'}.`);
