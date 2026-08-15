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

  async function accessToken(refreshToken) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.spotifyClientId,
      client_secret: config.spotifyClientSecret
    });
    const data = await request('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: body.toString()
    });
    if (!data?.access_token) throw new Error('Spotify did not return an access token.');
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
