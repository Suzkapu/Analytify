import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {HttpClient, provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {CURRENT_TERMS_VERSION, TermsAcceptanceService} from '@core/legal/terms-acceptance.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {environment} from '@env/environment';
import {TransientParticipantAuthService} from './transient-participant-auth.service';

const tokenUrl = 'https://accounts.spotify.com/api/token';
const requestKey = 'analytify_compare_auth_request';
const now = Date.parse('2026-10-24T12:00:00Z');

describe('Temporary Compare Room Spotify authorization HTTP boundaries', () => {
  let auth: TransientParticipantAuthService;
  let http: HttpTestingController;
  let terms: TermsAcceptanceService;

  beforeEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    document.cookie = 'analytify_terms_acceptance=; Path=/; Max-Age=0';
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stored = new Map<string, string>([['termsAcceptance',
      `${CURRENT_TERMS_VERSION}|${new Date(now).toISOString()}|00000000-0000-4000-8000-000000000001`]]);
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(),
      {provide: StorageService, useValue: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value)
      }}
    ]});
    terms = TestBed.inject(TermsAcceptanceService);
    terms.acceptCurrent();
    auth = TestBed.inject(TransientParticipantAuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    document.cookie = 'analytify_terms_acceptance=; Path=/; Max-Age=0';
    vi.restoreAllMocks();
  });

  // This is the browser request persisted before Spotify leaves the site, not private service state.
  function pendingRequest(overrides: Record<string, unknown> = {}) {
    sessionStorage.setItem(requestKey, JSON.stringify({state: 'single-use-state', verifier: 'test-pkce-verifier',
      returnUrl: '/compare-room/join/invitation', createdAt: now, ...overrides}));
  }
  async function connect(response: Record<string, unknown> = {}) {
    pendingRequest();
    const callback = auth.handleCallback('spotify-code', 'single-use-state');
    http.expectOne(tokenUrl).flush({access_token: 'temporary-access', refresh_token: 'temporary-refresh',
      expires_in: 3600, scope: 'playlist-read-private', ...response});
    await callback;
  }

  it('exchanges the code with the persisted PKCE verifier and keeps credentials in memory only', async () => {
    pendingRequest();
    const callback = auth.handleCallback('spotify-code', 'single-use-state');
    const request = http.expectOne(tokenUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(request.request.body))).toEqual({client_id: environment.spotifyClientId,
      grant_type: 'authorization_code', code: 'spotify-code', redirect_uri: environment.compareRoomRedirectUri,
      code_verifier: 'test-pkce-verifier'});
    expect(sessionStorage.getItem(requestKey)).toBeNull();
    request.flush({access_token: 'temporary-access', expires_in: 3600});
    expect(await callback).toBe('/compare-room/join/invitation');
    expect(await auth.getAccessToken()).toBe('temporary-access');
    expect(auth.hasSession()).toBe(true);
    expect(sessionStorage.length).toBe(0);
    const fresh = new TransientParticipantAuthService(TestBed.inject(HttpClient), terms);
    expect(fresh.hasSession()).toBe(false);
  });

  it('rejects a callback replay while the first exchange is still held', async () => {
    pendingRequest();
    const first = auth.handleCallback('code', 'single-use-state');
    const held = http.expectOne(tokenUrl);
    await expect(auth.handleCallback('code', 'single-use-state')).rejects.toThrow(/missing or expired/);
    held.flush({access_token: 'access'});
    await first;
  });

  it.each([{state: 'wrong-state'}, {createdAt: now - 600001}])('rejects invalid or expired state without token exchange: %j', async overrides => {
    pendingRequest(overrides);
    await expect(auth.handleCallback('code', 'single-use-state')).rejects.toThrow(/invalid authorization state|request expired/);
    expect(auth.hasSession()).toBe(false);
    expect(sessionStorage.getItem(requestKey)).toBeNull();
  });

  it('requires current terms before starting authorization or accepting a callback', async () => {
    // A material terms update invalidates both the cookie and durable fallback.
    vi.spyOn(terms, 'hasCurrentAcceptance').mockReturnValue(false);
    pendingRequest();
    await expect(auth.startAuthorization('/compare-room')).rejects.toThrow(/Accept the current Terms/);
    await expect(auth.handleCallback('code', 'single-use-state')).rejects.toThrow(/Accept the current Terms/);
    expect(auth.hasSession()).toBe(false);
  });

  it('does not retain a failed exchange or an absent access token', async () => {
    pendingRequest();
    const callback = auth.handleCallback('code', 'single-use-state');
    const rejected = expect(callback).rejects.toThrow(/access token/);
    http.expectOne(tokenUrl).flush({refresh_token: 'refresh'});
    await rejected;
    expect(auth.hasSession()).toBe(false);
    await expect(auth.getAccessToken()).rejects.toThrow(/no longer available/);
  });

  it('refreshes at the one-minute expiry boundary, preserving the refresh token when Spotify omits rotation', async () => {
    await connect({expires_in: 60});
    const first = auth.getAccessToken();
    const request = http.expectOne(tokenUrl);
    expect(Object.fromEntries(new URLSearchParams(request.request.body))).toEqual({grant_type: 'refresh_token',
      refresh_token: 'temporary-refresh', client_id: environment.spotifyClientId});
    request.flush({access_token: 'refreshed', expires_in: 60});
    expect(await first).toBe('refreshed');
    const second = auth.getAccessToken();
    const repeat = http.expectOne(tokenUrl);
    expect(new URLSearchParams(repeat.request.body).get('refresh_token')).toBe('temporary-refresh');
    repeat.flush({access_token: 'next', expires_in: 3600});
    expect(await second).toBe('next');
    expect(await auth.getAccessToken()).toBe('next');
  });

  it('uses a rotated refresh token for the next refresh', async () => {
    await connect({expires_in: 60});
    const first = auth.getAccessToken();
    http.expectOne(tokenUrl).flush({access_token: 'rotated-access', refresh_token: 'rotated-refresh', expires_in: 60});
    await first;
    const second = auth.getAccessToken();
    const request = http.expectOne(tokenUrl);
    expect(new URLSearchParams(request.request.body).get('refresh_token')).toBe('rotated-refresh');
    request.flush({access_token: 'final', expires_in: 3600});
    expect(await second).toBe('final');
  });

  it('shares a held refresh between callers so a rotating credential is exchanged only once', async () => {
    await connect({expires_in: 60});
    const first = auth.getAccessToken();
    const second = auth.getAccessToken();
    const request = http.expectOne(tokenUrl);
    request.flush({access_token: 'shared-access', refresh_token: 'rotated-refresh', expires_in: 3600});
    expect(await Promise.all([first, second])).toEqual(['shared-access', 'shared-access']);
  });

  it('asks for reconnection when an expiring session has no refresh token', async () => {
    await connect({refresh_token: null, expires_in: 60});
    await expect(auth.getAccessToken()).rejects.toThrow(/expired.*reconnect/);
  });

  it('allows a refresh transport failure to be retried without discarding the original refresh credential', async () => {
    await connect({expires_in: 60});
    const first = auth.getAccessToken();
    const rejection = expect(first).rejects.toMatchObject({status: 503});
    http.expectOne(tokenUrl).flush({}, {status: 503, statusText: 'Unavailable'});
    await rejection;
    const retry = auth.getAccessToken();
    const request = http.expectOne(tokenUrl);
    expect(new URLSearchParams(request.request.body).get('refresh_token')).toBe('temporary-refresh');
    request.flush({access_token: 'recovered'});
    expect(await retry).toBe('recovered');
  });

  it('clears both in-memory credentials and a pending authorization request', async () => {
    await connect();
    pendingRequest();
    auth.clear();
    expect(auth.hasSession()).toBe(false);
    expect(sessionStorage.getItem(requestKey)).toBeNull();
    await expect(auth.getAccessToken()).rejects.toThrow(/no longer available/);
  });

  it('accepts a callback at exactly ten minutes and rejects it one millisecond later', async () => {
    pendingRequest({createdAt: now - 600000});
    const callback = auth.handleCallback('code', 'single-use-state');
    http.expectOne(tokenUrl).flush({access_token: 'boundary-access'});
    expect(await callback).toBe('/compare-room/join/invitation');
    auth.clear();
    pendingRequest({createdAt: now - 600001});
    await expect(auth.handleCallback('code', 'single-use-state')).rejects.toThrow(/request expired/);
    expect(auth.hasSession()).toBe(false);
  });

  it('never exchanges a token for corrupt browser request JSON', async () => {
    sessionStorage.setItem(requestKey, '{broken-json');
    await expect(auth.handleCallback('code', 'single-use-state')).rejects.toThrow();
    expect(auth.hasSession()).toBe(false);
  });

  it('fails closed when browser request storage becomes inaccessible', async () => {
    vi.stubGlobal('sessionStorage', {getItem: () => {throw new Error('Storage disabled');}});
    await expect(auth.handleCallback('code', 'single-use-state')).rejects.toThrow('Storage disabled');
    expect(auth.hasSession()).toBe(false);
  });

  it('does not resurrect credentials when a held rotating refresh returns after clear', async () => {
    await connect({expires_in: 60});
    const refresh = auth.getAccessToken().catch(error => error);
    const held = http.expectOne(tokenUrl);
    auth.clear();
    held.flush({access_token: 'stale-access', refresh_token: 'stale-refresh', scope: 'playlist-read-private'});
    expect(await refresh).toMatchObject({name: 'AbortError'});
    expect(auth.hasSession()).toBe(false);
    await expect(auth.getAccessToken()).rejects.toThrow(/no longer available/);
  });

  it('does not resurrect a temporary session when a held callback returns after clear', async () => {
    pendingRequest();
    const callback = auth.handleCallback('code', 'single-use-state').catch(error => error);
    const held = http.expectOne(tokenUrl);
    auth.clear();
    held.flush({access_token: 'stale-access', refresh_token: 'stale-refresh'});
    expect(await callback).toMatchObject({name: 'AbortError'});
    expect(auth.hasSession()).toBe(false);
    await expect(auth.getAccessToken()).rejects.toThrow(/no longer available/);
  });

  it('does not overwrite a replacement session when an old refresh returns after clear and reconnect', async () => {
    await connect({expires_in: 60});
    const old = auth.getAccessToken().catch(error => error);
    const held = http.expectOne(tokenUrl);
    auth.clear();
    await connect({access_token: 'replacement-access', refresh_token: 'replacement-refresh'});
    held.flush({access_token: 'old-refreshed-access', refresh_token: 'old-refreshed-refresh'});
    expect(await old).toMatchObject({name: 'AbortError'});
    expect(await auth.getAccessToken()).toBe('replacement-access');
  });

  it('rejects an older callback after a newer valid authorization completes', async () => {
    pendingRequest();
    const old = auth.handleCallback('old-code', 'single-use-state').catch(error => error);
    const held = http.expectOne(tokenUrl);
    await connect({access_token: 'new-access'});
    held.flush({access_token: 'old-access'});
    expect(await old).toMatchObject({name: 'AbortError'});
    expect(await auth.getAccessToken()).toBe('new-access');
  });

  it.each(['old-first', 'replacement-first'])('keeps a replacement callback refresh independent of an older held refresh: %s', async order => {
    await connect({expires_in: 60});
    const old = auth.getAccessToken().catch(error => error);
    const held = http.expectOne(tokenUrl);
    await connect({access_token: 'replacement-access', refresh_token: 'replacement-refresh', expires_in: 60});
    const replacement = auth.getAccessToken();
    const request = http.expectOne(tokenUrl);
    expect(new URLSearchParams(request.request.body).get('refresh_token')).toBe('replacement-refresh');
    const finishOld = async () => {
      held.flush({access_token: 'old-refreshed', refresh_token: 'old-rotated'});
      expect(await old).toMatchObject({name: 'AbortError'});
    };
    if (order === 'old-first') await finishOld();
    request.flush({access_token: 'replacement-refreshed', refresh_token: 'replacement-rotated', expires_in: 3600});
    expect(await replacement).toBe('replacement-refreshed');
    if (order === 'replacement-first') await finishOld();
    expect(await auth.getAccessToken()).toBe('replacement-refreshed');
  });

  it('does not persist or navigate an authorization whose held PKCE challenge finishes after clear', async () => {
    let release!: (digest: ArrayBuffer) => void;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(resolve => {release = resolve;}));
    const authorization = auth.startAuthorization('/compare-room').catch(error => error);
    auth.clear();
    release(new ArrayBuffer(32));
    expect(await authorization).toMatchObject({name: 'AbortError'});
    expect(sessionStorage.getItem(requestKey)).toBeNull();
    expect(auth.hasSession()).toBe(false);
  });

  it('rejects a successful HTTP refresh without an access token and permits a later valid retry', async () => {
    await connect({expires_in: 60});
    const refresh = auth.getAccessToken();
    const outcome = refresh.then(value => ({value}), error => ({error}));
    http.expectOne(tokenUrl).flush({expires_in: 3600});
    expect(await outcome).toHaveProperty('error');
    const retry = auth.getAccessToken();
    http.expectOne(tokenUrl).flush({access_token: 'valid-retry'});
    expect(await retry).toBe('valid-retry');
  });
});
