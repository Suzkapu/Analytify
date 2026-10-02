import assert from 'node:assert/strict';
import {test} from 'node:test';
import {coverageRegressions, isDesignV2BehaviorSource} from './design-v2-test-policy.mjs';

const source = 'src/app/features/insights/user-stats/v2-user-stats.component.ts';
const entry = (total, covered) => Object.fromEntries(
  ['statements', 'branches', 'functions', 'lines'].map(metric => [metric, {total, covered}])
);

test('includes Insights, new v2 helpers, shared primitives, ambient, and design navigation', () => {
  for (const path of [source, 'src/app/shared/ui-v2/design-v2-primitives.ts',
    'src/app/features/new-feature/design-v2/state.ts', 'src/app/shared/ambient/renderer.ts',
    'src/app/core/navigation/design-path.ts', 'src/app/features/design-v2/new-behavior.module.ts']) {
    assert.equal(isDesignV2BehaviorSource(path), true, path);
  }
  for (const path of [source.replace('.ts', '.spec.ts'), 'src/app/shared/ui-v2/index.ts',
    'src/app/design-v2-routing.module.ts', 'src/app/core/navigation/spotify-url.ts']) {
    assert.equal(isDesignV2BehaviorSource(path), false, path);
  }
});

test('requires evidence for every source, including a newly added file', () => {
  assert.match(coverageRegressions([source], {}, {}).join(), /missing coverage evidence/);
});

test('a new source must have no uncovered code in any metric', () => {
  assert.deepEqual(coverageRegressions([source], {[source]: entry(5, 5)}, {}), []);
  assert.equal(coverageRegressions([source], {[source]: entry(5, 4)}, {}).length, 4);
});

test('absolute uncovered counts cannot be diluted by adding covered code', () => {
  const baseline = {[source]: {statements: 1, branches: 1, functions: 1, lines: 1}};
  assert.deepEqual(coverageRegressions([source], {[source]: entry(10, 9)}, baseline), []);
  assert.equal(coverageRegressions([source], {[source]: entry(1000, 998)}, baseline).length, 4);
});

test('supports absolute Windows and Unix report paths', () => {
  for (const path of [`/workspace/${source}`, `C:\\workspace\\${source.replaceAll('/', '\\')}`]) {
    assert.deepEqual(coverageRegressions([source], {[path]: entry(1, 1)}, {}), []);
  }
});

test('fails closed for malformed coverage counters', () => {
  for (const value of [entry(-1, 0), entry(1, 2), entry(1, 0.5), {}]) {
    assert.equal(coverageRegressions([source], {[source]: value}, {}).length, 4);
  }
});
