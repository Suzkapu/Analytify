function createSpotifyClient(config) {
  async function request(url, options = {}, retryCount = 0) {
    const headers = {...(options.headers || {})};
    if (url.startsWith('https://api.spotify.com/v1')) {
      headers['Accept-Language'] = 'en-GB,en-US;q=0.9,en;q=0.8';
    }
    const response = await fetch(url, {...options, headers});
    if (response.status === 429 && retryCount < 3) {
      const retryAfterSeconds = Math.min(30, Math.max(1, Number(response.headers.get('retry-after')) || 1));
      await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
      return request(url, options, retryCount + 1);
    }
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`Spotify request failed (${response.status}): ${text || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  }

  async function accessToken(credential) {
    if (!credential?.refreshToken) throw new Error('Spotify refresh credential is missing.');
    const personal = credential.connectionMode === 'personal_pkce';
    const clientId = personal ? credential.clientId : config.spotifyClientId;
    if (!clientId) throw new Error('Spotify Client ID is missing.');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken,
      client_id: clientId
    });
    if (!personal) body.set('client_secret', config.spotifyClientSecret);
    const data = await request('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: body.toString()
    });
    if (!data?.access_token) throw new Error('Spotify did not return an access token.');
    if (data.refresh_token && data.refresh_token !== credential.refreshToken) {
      await credential.saveRefreshToken(data.refresh_token);
    }
    return data.access_token;
  }

  async function api(pathname, token, options = {}) {
    return request(`https://api.spotify.com/v1${pathname}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  }

  return {request, accessToken, api};
}

module.exports = {createSpotifyClient};
