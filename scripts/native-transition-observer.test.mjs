import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transitionRecovery} from '../e2e/helpers/native-transitions.ts';

const cancellation = 'AbortError: Transition was skipped. New ViewTransition started';
const completed = [{id: 1, stage: 'updated'}, {id: 1, stage: 'finished'}, {id: 2, stage: 'updated'}, {id: 2, stage: 'finished'}];
const settled = {pending: 0, missingUpdates: 0, missingFinishes: 0, unmatchedErrors: 0, unexpectedErrors: []};

test('superseding an animation still requires every DOM update and finished promise to complete', () => {
  assert.deepEqual(transitionRecovery({pending: 0, starts: 2, errors: [cancellation], records: [...completed, {id: 1, stage: 'ready-rejected', error: cancellation}]}), settled);
  assert.notDeepEqual(transitionRecovery({pending: 1, starts: 2, errors: [cancellation], records: completed.slice(0, 2)}), settled);
});

test('timeouts, failed DOM callbacks, unknown skips and rejection of the latest transition fail recovery', () => {
  for (const [id, stage, error] of [
    [1, 'ready-rejected', 'TimeoutError: DOM update timed out'],
    [1, 'update-rejected', cancellation],
    [1, 'finish-rejected', cancellation],
    [1, 'ready-rejected', 'AbortError: unknown cause'],
    [2, 'ready-rejected', cancellation]
  ]) {
    assert.notDeepEqual(transitionRecovery({pending: 0, starts: 2, errors: [error], records: [...completed, {id, stage, error}]}), settled);
  }
});

test('uncaptured errors and incomplete DOM/finished records cannot appear settled', () => {
  assert.notDeepEqual(transitionRecovery({pending: 0, starts: 2, errors: ['uncaptured'], records: completed}), settled);
  for (const stage of ['updated', 'finished']) {
    assert.notDeepEqual(transitionRecovery({pending: 0, starts: 2, errors: [], records: completed.filter(record => record.stage !== stage)}), settled);
  }
});
