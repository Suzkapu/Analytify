const test = require('node:test');
const assert = require('node:assert/strict');

const {createSpotifyClient} = require('./spotify-client');

test('refreshes a personal PKCE credential without sending a client secret', async () => {
  const originalFetch = global.fetch;
  let requestBody = '';
  let savedRefreshToken = '';
  global.fetch = async (_url, options) => {
    requestBody = options.body;
    return new Response(JSON.stringify({access_token: 'access', refresh_token: 'rotated'}), {
      status: 200, headers: {'Content-Type': 'application/json'}
    });
  };
  try {
    const spotify = createSpotifyClient({spotifyClientId: 'hosted-id', spotifyClientSecret: 'hosted-secret'});
    const accessToken = await spotify.accessToken({
      connectionMode: 'personal_pkce',
      clientId: 'personal-client-id',
      refreshToken: 'personal-refresh',
      async saveRefreshToken(value) { savedRefreshToken = value; }
    });
    assert.equal(accessToken, 'access');
    assert.match(requestBody, /client_id=personal-client-id/);
    assert.doesNotMatch(requestBody, /client_secret/);
    assert.equal(savedRefreshToken, 'rotated');
  } finally {
    global.fetch = originalFetch;
  }
});

test('keeps the hosted confidential-client refresh behavior', async () => {
  const originalFetch = global.fetch;
  let requestBody = '';
  global.fetch = async (_url, options) => {
    requestBody = options.body;
    return new Response(JSON.stringify({access_token: 'access'}), {
      status: 200, headers: {'Content-Type': 'application/json'}
    });
  };
  try {
    const spotify = createSpotifyClient({spotifyClientId: 'hosted-id', spotifyClientSecret: 'hosted-secret'});
    await spotify.accessToken({connectionMode: 'hosted', clientId: null, refreshToken: 'hosted-refresh'});
    assert.match(requestBody, /client_id=hosted-id/);
    assert.match(requestBody, /client_secret=hosted-secret/);
  } finally {
    global.fetch = originalFetch;
  }
});

