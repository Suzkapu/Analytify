const test = require('node:test');
const assert = require('node:assert/strict');

const {dailyCutoff, snapshotDate} = require('./date-utils');

test('uses the previous local day before the 01:00 cutoff', () => {
  const now = new Date('2026-08-14T22:30:00.000Z'); // 00:30 on 15 August in Vienna
  assert.equal(snapshotDate(now, 'Europe/Vienna'), '2026-08-14');
  assert.equal(dailyCutoff(now, 'Europe/Vienna').toISOString(), '2026-08-13T23:00:00.000Z');
});

test('uses the current local day after the cutoff', () => {
  const now = new Date('2026-08-15T02:00:00.000Z');
  assert.equal(snapshotDate(now, 'Europe/Vienna'), '2026-08-15');
  assert.equal(dailyCutoff(now, 'Europe/Vienna').toISOString(), '2026-08-14T23:00:00.000Z');
});
