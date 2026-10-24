import assert from 'node:assert/strict';
import {test} from 'node:test';
import {availableParallelism} from 'node:os';
import {readFileSync} from 'node:fs';
import {productionSourceInventory} from './design-v2-source-inventory.mjs';
import {coverageRegressions, isDesignV2BehaviorSource} from './design-v2-test-policy.mjs';

const source = 'src/app/features/insights/user-stats/v2-user-stats.component.ts';
const entry = (total, covered) => Object.fromEntries(
  ['statements', 'branches', 'functions', 'lines'].map(metric => [metric, {total, covered}])
);

test('keeps native component checks separate from ordinary unit coverage', () => {
  const architect = JSON.parse(readFileSync('angular.json', 'utf8')).projects.SpotiFront.architect;
  const native = architect['native-components'];
  assert.equal(native.builder, '@angular/build:unit-test');
  assert.equal(native.options.runner, 'vitest');
  assert.equal(native.options.runnerConfig, 'vitest.native-components.config.mjs');
  assert.deepEqual(native.options.include, ['../e2e/components/*.native.ts']);
  assert.equal(native.options.watch, false);
  assert.equal(native.options.coverageExclude, undefined);
  assert.equal(architect.test.options.runnerConfig, 'vitest.base.config.mjs');
  assert.deepEqual(architect.test.options.coverageInclude, ['src/**/*.ts']);
});

test('native visual checks reject updates and compare all three browser engines strictly', async () => {
  const {test: configuration} = (await import('../vitest.native-components.config.mjs')).default;
  assert.equal(configuration.update, 'none');
  assert.equal(configuration.browser.enabled, true);
  assert.equal(configuration.browser.headless, true);
  assert.deepEqual(configuration.browser.instances.map(instance => instance.browser), ['chromium', 'firefox', 'webkit']);
  assert.deepEqual(configuration.browser.expect.toMatchScreenshot.comparatorOptions,
    {allowedMismatchedPixels: 0, allowedMismatchedPixelRatio: 0, threshold: 0.1});
  const source = readFileSync('e2e/components/friends-feedback.native.ts', 'utf8');
  assert.match(source, /expect\.element\(alert\)\.toMatchScreenshot/);
});

test('preview verification requires native component checks after installing browser engines', () => {
  const workflow = readFileSync('.github/workflows/preview.yml', 'utf8');
  const verify = workflow.split(/\n  friends-http-contract:/)[0];
  const native = verify.indexOf('run: npm run test:native-components');
  assert.ok(native > verify.indexOf('npx playwright install --with-deps chromium firefox webkit'));
  assert.ok(native < verify.indexOf('Record preview artifact identity'));
  assert.match(workflow, /deploy:\s*\n\s+needs: \[verify, friends-http-contract\]/);
});

test('bounds concurrent test environments without weakening deadlines or coverage', async () => {
  const runner = (await import('../vitest.base.config.mjs')).default;
  const options = JSON.parse(readFileSync('angular.json', 'utf8')).projects.SpotiFront.architect.test.options;
  assert.equal(options.runnerConfig, 'vitest.base.config.mjs');
  assert.equal(runner.test.maxWorkers, Math.min(4, availableParallelism()));
  for (const option of ['testTimeout', 'hookTimeout', 'isolate', 'coverage', 'exclude']) {
    assert.equal(runner.test[option], undefined, option);
  }
});

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

test('isolates the browser fixture entry point and disables its service worker', () => {
  const architect = JSON.parse(readFileSync('angular.json', 'utf8')).projects.SpotiFront.architect;
  assert.equal(architect.build.options.browser, 'src/main.ts');
  assert.equal(architect.build.defaultConfiguration, 'production');
  assert.equal(architect.serve.defaultConfiguration, 'development');
  for (const name of ['production', 'development', 'testing']) {
    const configuration = architect.build.configurations[name];
    assert.equal(configuration.browser, undefined, name);
    assert.ok(!JSON.stringify(configuration).includes('browser-testing'), name);
  }
  const fixture = architect.build.configurations['browser-testing'];
  assert.equal(fixture.browser, 'src/main.browser-testing.ts');
  assert.equal(fixture.serviceWorker, false);
  assert.deepEqual(fixture.fileReplacements, [{replace: 'src/environments/environment.ts', with: 'src/environments/environment.browser-testing.ts'}]);
});

test('documents only the two non-production browser fixture exclusions', () => {
  const inventory = productionSourceInventory().frontend;
  const fixtures = ['src/main.browser-testing.ts', 'src/environments/environment.browser-testing.ts'];
  assert.deepEqual(inventory.exclusions.filter(item => /loopback browser-test/.test(item.reason)).map(item => item.path).sort(), fixtures.sort());
  for (const path of fixtures) assert.ok(!inventory.sources.includes(path));
  for (const path of ['src/main.ts', 'src/environments/environment.ts', 'src/app/core/friends/friends.service.ts', 'src/app/features/friends/v2-friends-page.component.ts']) {
    assert.ok(inventory.sources.includes(path), path);
  }
});

test('requires the dedicated Friends browser suite in preview CI', () => {
  const workflow = readFileSync('.github/workflows/preview.yml', 'utf8');
  assert.match(workflow, /run: npx playwright test --config=playwright\.friends\.config\.ts/);
  assert.match(workflow, /docs\/testing-evidence\/design-v2\/friends-browser-artifacts/);
  const configuration = readFileSync('playwright.friends.config.ts', 'utf8');
  assert.match(configuration, /testMatch: 'design-v2-friends\.spec\.ts'/);
  assert.match(configuration, /testIgnore: \[\]/);
});

test('requires isolated real Friends HTTP verification before preview deployment', () => {
  const workflow = readFileSync('.github/workflows/preview.yml', 'utf8');
  const job = workflow.match(/^  friends-http-contract:\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/m)?.[1];
  assert.ok(job, 'A dedicated isolated HTTP contract job is required.');
  assert.match(job, /runs-on: ubuntu-24\.04/);
  assert.match(job, /node scripts\/provision-isolated-friends-runtime\.mjs/);
  assert.match(job, /node scripts\/test-isolated-friends-http-contract\.mjs --angular-contract/);
  assert.match(job, /node integration\/friends-http\/verify-isolation\.mjs/);
  assert.doesNotMatch(job, /continue-on-error|--handshake-only|secrets\./);
  assert.match(job, /if: always\(\)/);
  assert.match(workflow, /deploy:\n\s+needs: \[verify, friends-http-contract\]/);
});
