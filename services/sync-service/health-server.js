const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function deployedCommit() {
  const fromEnvironment = (process.env.DEPLOY_COMMIT_SHA || '').trim();
  if (fromEnvironment) return fromEnvironment;
  try {
    return fs.readFileSync(path.join(__dirname, '.deployed-commit'), 'utf8').trim();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return 'development';
  }
}

function createHealthHandler(state, commit) {
  return (request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify({error: 'Not found'}));
      return;
    }
    response.writeHead(state.ready ? 200 : 503, {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify({component: 'analytify-sync', commit, ...state}));
  };
}

function createHealthServer({port = 8787, commit = deployedCommit()} = {}) {
  const state = {ready: false, startedAt: new Date().toISOString(), lastPassAt: null, lastError: null};
  const server = http.createServer(createHealthHandler(state, commit));
  return {
    state,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server.address()));
    }),
    close: () => new Promise(resolve => server.close(() => resolve())),
    markReady: () => { state.ready = true; state.lastError = null; },
    recordPass: () => { state.lastPassAt = new Date().toISOString(); state.lastError = null; },
    recordFailure: error => { state.lastError = error instanceof Error ? error.message : String(error); }
  };
}

module.exports = {createHealthServer, createHealthHandler, deployedCommit};
