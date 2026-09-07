import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const summaryPath = path.resolve('coverage', 'SpotiFront', 'coverage-summary.json');
const summary = JSON.parse(await readFile(summaryPath, 'utf8')).total;
const thresholds = {
  statements: 55,
  branches: 40,
  functions: 51,
  lines: 59,
};

for (const [metric, minimum] of Object.entries(thresholds)) {
  const percentage = summary[metric]?.pct;
  assert.equal(typeof percentage, 'number', `Coverage summary is missing ${metric}.`);
  assert.ok(
    percentage >= minimum,
    `${metric} coverage ${percentage}% is below the ${minimum}% baseline.`,
  );
}

console.log('Coverage thresholds passed.');
