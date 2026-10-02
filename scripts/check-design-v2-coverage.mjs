import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {coverageRegressions, isDesignV2BehaviorSource} from './design-v2-test-policy.mjs';

function filesBelow(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const sources = filesBelow('src/app').filter(isDesignV2BehaviorSource);
const summary = JSON.parse(readFileSync('coverage/SpotiFront/coverage-summary.json', 'utf8'));
const baseline = JSON.parse(readFileSync(new URL('./design-v2-coverage-baseline.json', import.meta.url), 'utf8'));
const failures = coverageRegressions(sources, summary, baseline);
if (failures.length) throw new Error(`Design v2 coverage regressed:\n${failures.join('\n')}`);
console.log(`Design v2 uncovered-code budgets passed for ${sources.length} behavioral sources.`);
