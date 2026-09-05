const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

class ExternalRequestError extends Error {
  constructor(message, {kind, status, cause} = {}) {
    super(message, {cause});
    this.name = 'ExternalRequestError';
    this.kind = kind || 'permanent';
    this.status = status;
  }
}

function retryAfterMilliseconds(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function createSpotifyClient(config, dependencies = {}) {
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const sleep = dependencies.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const random = dependencies.random || Math.random;
  const now = dependencies.now || Date.now;
  const timeoutMs = Number(config.spotifyRequestTimeoutMs) || 15_000;
  const elapsedBudgetMs = Number(config.spotifyRetryBudgetMs) || 45_000;
  const maxAttempts = Number(config.spotifyMaxAttempts) || 4;

  async function fetchWithDeadline(url, options) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    if (externalSignal?.aborted) throw new ExternalRequestError('Spotify request was cancelled.', {kind: 'cancelled'});
    const cancel = () => controller.abort(externalSignal.reason);
    externalSignal?.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(() => controller.abort(new Error('deadline exceeded')), timeoutMs);
    timer.unref?.();
    try {
      return await fetchImpl(url, {...options, signal: controller.signal});
    } catch (error) {
      if (externalSignal?.aborted) throw new ExternalRequestError('Spotify request was cancelled.', {kind: 'cancelled', cause: error});
      if (controller.signal.aborted) {
        throw new ExternalRequestError(`Spotify request timed out after ${timeoutMs}ms.`, {kind: 'timeout', cause: error});
      }
      throw new ExternalRequestError(`Spotify request failed: ${error.message || error}`, {kind: 'transient', cause: error});
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  async function request(url, options = {}) {
    const headers = {...(options.headers || {})};
    if (url.startsWith('https://api.spotify.com/v1')) headers['Accept-Language'] = 'en-GB,en-US;q=0.9,en;q=0.8';
    const method = String(options.method || 'GET').toUpperCase();
    const retryableMethod = IDEMPOTENT_METHODS.has(method) || options.retryUnsafe === true;
    const startedAt = now();
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response;
      try {
        response = await fetchWithDeadline(url, {...options, headers});
      } catch (error) {
        lastError = error;
        if (error.kind === 'cancelled' || !retryableMethod || attempt === maxAttempts) throw error;
      }
      if (response) {
        const text = await response.text();
        if (response.ok) return text ? JSON.parse(text) : null;
        const kind = TRANSIENT_STATUSES.has(response.status) ? 'transient' : 'permanent';
        lastError = new ExternalRequestError(`Spotify request failed (${response.status}): ${text || response.statusText}`, {
          kind, status: response.status
        });
        if (kind === 'permanent' || !retryableMethod || attempt === maxAttempts) throw lastError;
        lastError.retryAfterMs = retryAfterMilliseconds(response.headers.get('retry-after'), now());
      }
      const exponentialMs = Math.min(10_000, 500 * (2 ** (attempt - 1)));
      const delayMs = Math.min(30_000, lastError.retryAfterMs ?? Math.round(exponentialMs * (0.75 + random() * 0.5)));
      if (now() - startedAt + delayMs > elapsedBudgetMs) {
        throw new ExternalRequestError('Spotify retry budget was exhausted.', {kind: 'retry_exhausted', cause: lastError});
      }
      await sleep(delayMs);
      if (options.signal?.aborted) throw new ExternalRequestError('Spotify request was cancelled.', {kind: 'cancelled'});
    }
    throw lastError;
  }

  async function accessToken(credential) {
    if (!credential?.refreshToken) throw new Error('Spotify refresh credential is missing.');
    const personal = credential.connectionMode === 'personal_pkce';
    const clientId = personal ? credential.clientId : config.spotifyClientId;
    if (!clientId) throw new Error('Spotify Client ID is missing.');
    const body = new URLSearchParams({grant_type: 'refresh_token', refresh_token: credential.refreshToken, client_id: clientId});
    if (!personal) body.set('client_secret', config.spotifyClientSecret);
    const data = await request('https://accounts.spotify.com/api/token', {
      method: 'POST', retryUnsafe: true, headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()
    });
    if (!data?.access_token) throw new Error('Spotify did not return an access token.');
    if (data.refresh_token && data.refresh_token !== credential.refreshToken) await credential.saveRefreshToken(data.refresh_token);
    return data.access_token;
  }

  async function api(pathname, token, options = {}) {
    return request(`https://api.spotify.com/v1${pathname}`, {...options, headers: {
      'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {})
    }});
  }

  return {request, accessToken, api};
}

module.exports = {createSpotifyClient, ExternalRequestError, retryAfterMilliseconds};
