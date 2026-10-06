import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {applicationCoverage} from './report-worker-v8-coverage.mjs';

test('absent production source contributes uncovered statements, branches and functions without executing it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'analytify-coverage-'));
  try {
    const source = join(directory, 'never-import.js');
    writeFileSync(source, 'function decide(ok) { if (ok) return 1; return 0; }\nthrow new Error("must never execute");\n');
    const map = await applicationCoverage([source], [{result: []}]);
    assert.deepEqual(map.files(), [source]);
    for (const metric of ['statements', 'branches', 'functions', 'lines']) {
      const result = map.getCoverageSummary().toJSON()[metric];
      assert.ok(result.total > 0, `${metric} must contribute to the denominator`);
      assert.equal(result.covered, 0);
      assert.equal(result.pct, 0);
    }
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('coverage combines an executed source with an unimported source rather than masking the latter', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'analytify-coverage-'));
  try {
    const executed = join(directory, 'executed.js'), missing = join(directory, 'missing.js');
    const code = 'globalThis.example = 1;\n';
    writeFileSync(executed, code);
    writeFileSync(missing, code);
    const map = await applicationCoverage([executed, missing], [{result: [{url: pathToFileURL(executed).href, scriptId: '1',
      functions: [{functionName: '', isBlockCoverage: true, ranges: [{startOffset: 0, endOffset: code.length, count: 1}]}]}]}]);
    assert.equal(map.getCoverageSummary().toJSON().statements.pct, 50);
    assert.equal(map.fileCoverageFor(missing).toSummary().statements.covered, 0);
    assert.equal(map.fileCoverageFor(executed).toSummary().statements.covered, 1);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('missing execution evidence cannot produce a passing report', async () => {
  await assert.rejects(applicationCoverage([], []), /unverified/);
});
