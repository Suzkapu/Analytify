const test = require('node:test');
const assert = require('node:assert/strict');
const {createHealthHandler} = require('./health-server');

test('readiness exposes the exact worker commit and startup state', () => {
  const state = {ready: false, startedAt: '2026-09-05T00:00:00Z', lastPassAt: null, lastError: null};
  const handler = createHealthHandler(state, 'abc123');
  let status;
  let body;
  handler({method: 'GET', url: '/health'}, {
    writeHead: value => { status = value; },
    end: value => { body = JSON.parse(value); }
  });
  assert.equal(status, 503);
  assert.deepEqual(body, {component: 'analytify-sync', commit: 'abc123', ...state});

  state.ready = true;
  state.lastPassAt = '2026-09-05T00:01:00Z';
  handler({method: 'GET', url: '/health'}, {
    writeHead: value => { status = value; },
    end: value => { body = JSON.parse(value); }
  });
  assert.equal(status, 200);
  assert.equal(body.commit, 'abc123');
  assert.equal(body.lastPassAt, state.lastPassAt);
});
