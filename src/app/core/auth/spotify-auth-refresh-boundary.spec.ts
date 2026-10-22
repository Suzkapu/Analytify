import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {provideHttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from './spotify-auth.service';
import {SessionLifecycleService} from './session-lifecycle.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {TermsAcceptanceService} from '@core/legal/terms-acceptance.service';

const tokenUrl = 'https://accounts.spotify.com/api/token';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

describe('Spotify refresh and restored-session ownership boundaries', () => {
  let values: Map<string, string>;
  let auth: SpotifyAuthService;
  let lifecycle: SessionLifecycleService;
  let http: HttpTestingController;
  let client: any;
  let supabase: any;

  beforeEach(async () => {
    values = new Map();
    client = {auth: {
      getSession: vi.fn().mockResolvedValue({data: {session: null}, error: null}),
      refreshSession: vi.fn(), exchangeCodeForSession: vi.fn(), signInWithOAuth: vi.fn().mockResolvedValue({data: {}, error: null}), signOut: vi.fn().mockResolvedValue({error: null})
    }, functions: {invoke: vi.fn().mockResolvedValue({data: {}, error: null})}, rpc: vi.fn().mockResolvedValue({error: null})};
    supabase = {getClient: vi.fn(async () => client), deleteUserCacheEntries: vi.fn().mockResolvedValue(undefined)};
    client.from = () => ({select() {return this;}, eq() {return this;}, abortSignal() {return this;}, maybeSingle: async () => ({data: null, error: null})});
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(),
      {provide: StorageService, useValue: {initFromDB: async () => {},
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)}},
      {provide: SupabaseService, useValue: supabase},
      {provide: TermsAcceptanceService, useValue: {assertCurrentAcceptance: vi.fn(), acceptCurrent: () => ({sessionId: 'isolated-terms-session'})}}
    ]});
    auth = TestBed.inject(SpotifyAuthService);
    lifecycle = TestBed.inject(SessionLifecycleService);
    http = TestBed.inject(HttpTestingController);
    await auth.restoreSessionFromSupabase();
    client.auth.getSession.mockClear();
  });
  afterEach(() => {http.verify(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();});
  function personal(owner = 'owner-A') {
    values.set('spotifyConnectionMode', 'personal_pkce');
    values.set('personalSpotifyClientId', '12345678901234567890123456789012');
    values.set('spotifyUserId', owner);
    values.set('supabaseUserId', `cloud-${owner}`);
    values.set('spotifyAccessToken', `access-${owner}`);
    values.set('spotifyRefreshToken', `refresh-${owner}`);
    values.set('cloudIdentityReady', 'true');
    values.set('spotifyTokenExpiresAt', String(Date.now() + 3600000));
  }

  it('cannot discard replacement-account credentials after the old personal refresh returns invalid_grant', async () => {
    personal();
    const oldRefresh = firstValueFrom(auth.refreshToken());
    const outcome = oldRefresh.catch(error => error);
    const oldRequest = http.expectOne(tokenUrl);
    await lifecycle.invalidateAndDrain();
    personal('owner-B');
    const replacement = new Map(values);
    oldRequest.flush({error: 'invalid_grant'}, {status: 400, statusText: 'Bad Request'});
    const error = await outcome;
    expect.soft(values).toEqual(replacement);
    expect.soft(client.functions.invoke).not.toHaveBeenCalled();
    expect(error).toMatchObject({name: 'AbortError'});
  });

  it('cannot send terminal credential cleanup through a replacement session after deferred SDK readiness', async () => {
    personal();
    const ready = deferred<any>();
    supabase.getClient.mockClear(); supabase.getClient.mockReturnValueOnce(ready.promise);
    const oldRefresh = firstValueFrom(auth.refreshToken());
    const outcome = oldRefresh.catch(error => error);
    http.expectOne(tokenUrl).flush({error: 'invalid_grant'}, {status: 400, statusText: 'Bad Request'});
    await vi.waitFor(() => expect(supabase.getClient).toHaveBeenCalledOnce());
    await lifecycle.invalidateAndDrain(); personal('owner-B'); const replacement = new Map(values);
    ready.resolve(client);
    const error = await outcome;
    expect.soft(client.functions.invoke).not.toHaveBeenCalled();
    expect.soft(values).toEqual(replacement);
    expect(error).toMatchObject({name: 'AbortError'});
  });

  it('shares one personal refresh request across subscribers and persists the rotated credential for its owner', async () => {
    personal();
    const first = firstValueFrom(auth.refreshToken());
    const second = firstValueFrom(auth.refreshToken());
    const request = http.expectOne(tokenUrl);
    const body = new URLSearchParams(request.request.body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-owner-A');
    expect(body.get('client_id')).toBe('12345678901234567890123456789012');
    expect(body.has('client_secret')).toBe(false);
    request.flush({access_token: 'new-access', refresh_token: 'rotated', expires_in: 1800});
    expect(await first).toEqual(await second);
    expect(values.get('spotifyAccessToken')).toBe('new-access');
    expect(values.get('spotifyRefreshToken')).toBe('rotated');
    await lifecycle.drainCurrent();
    expect(client.functions.invoke).toHaveBeenCalledExactlyOnceWith('spotify-credentials', {body: {
      action: 'store', profileUserId: 'cloud-owner-A', connectionMode: 'personal_pkce',
      clientId: '12345678901234567890123456789012', accessToken: 'new-access', refreshToken: 'rotated', spotifyId: 'owner-A'
    }});
    expect(Number(values.get('spotifyTokenExpiresAt'))).toBeGreaterThan(Date.now() + 1700000);
  });

  it('refreshes the replacement account independently while an old account refresh remains pending', async () => {
    personal(); const old = firstValueFrom(auth.refreshToken()); const oldRequest = http.expectOne(tokenUrl);
    await lifecycle.invalidateAndDrain(); personal('owner-B');
    const replacement = firstValueFrom(auth.refreshToken());
    const requests = http.match(tokenUrl);
    expect.soft(requests).toHaveLength(1);
    if (requests[0]) expect(new URLSearchParams(requests[0].request.body).get('refresh_token')).toBe('refresh-owner-B');
    oldRequest.flush({access_token: 'obsolete-A', refresh_token: 'obsolete-A-refresh'});
    await old;
    const sharedReplacement = firstValueFrom(auth.refreshToken());
    const unexpected = http.match(tokenUrl);
    expect.soft(unexpected).toHaveLength(0);
    requests[0]?.flush({access_token: 'refreshed-B', refresh_token: 'rotated-B'});
    for (const request of unexpected) request.flush({access_token: 'unexpected-B'});
    expect.soft(await replacement).toEqual({access_token: 'refreshed-B', refresh_token: 'rotated-B'});
    expect.soft(await sharedReplacement).toEqual({access_token: 'refreshed-B', refresh_token: 'rotated-B'});
    expect(values.get('spotifyAccessToken')).toBe('refreshed-B');
    expect(values.get('spotifyRefreshToken')).toBe('rotated-B');
  });

  it('retains personal credentials after transient failure and starts a fresh request on retry', async () => {
    personal(); const original = new Map(values);
    const failed = firstValueFrom(auth.refreshToken());
    const rejection = expect(failed).rejects.toMatchObject({status: 503});
    http.expectOne(tokenUrl).flush({error: 'temporarily_unavailable'}, {status: 503, statusText: 'Unavailable'});
    await rejection;
    expect(values).toEqual(original);
    expect(client.functions.invoke).not.toHaveBeenCalled();
    const retried = firstValueFrom(auth.refreshToken());
    http.expectOne(tokenUrl).flush({access_token: 'retry-access'});
    await retried;
    expect(values.get('spotifyAccessToken')).toBe('retry-access');
    expect(values.get('spotifyRefreshToken')).toBe('refresh-owner-A');
  });

  it.each(['refresh', 'client'])('does not issue an HTTP refresh without the required personal %s credential', async missing => {
    personal(); values.delete(missing === 'refresh' ? 'spotifyRefreshToken' : 'personalSpotifyClientId');
    await expect(firstValueFrom(auth.refreshToken())).rejects.toThrow('Please reconnect');
    http.expectNone(tokenUrl);
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it.each([
    {body: '{"error":"invalid_grant"}', terminal: true},
    {body: 'invalid_grant: refresh revoked', terminal: true},
    {body: 'invalid_client', terminal: false},
    {body: 17, terminal: false},
    {body: {error: 'invalid_client'}, terminal: false}
  ])('distinguishes permanent Spotify grant revocation from other400 errors ($body)', async ({body, terminal}) => {
    personal(); const original = new Map(values);
    const failed = firstValueFrom(auth.refreshToken());
    const rejection = terminal
      ? expect(failed).rejects.toThrow('Spotify authorization expired')
      : expect(failed).rejects.toMatchObject({status: 400});
    http.expectOne(tokenUrl).flush(body, {status: 400, statusText: 'Bad Request'});
    await rejection;
    if (terminal) {
      expect(values.get('spotifyAccessToken')).toBeUndefined();
      expect(values.get('spotifyRefreshToken')).toBeUndefined();
      expect(values.get('spotifyUserId')).toBe('owner-A');
      expect(values.get('personalSpotifyClientId')).toBe('12345678901234567890123456789012');
    } else expect(values).toEqual(original);
  });

  it('keeps local revocation effective when cloud credential deletion is denied', async () => {
    personal(); client.functions.invoke.mockResolvedValue({data: null, error: {message: 'isolated denied'}});
    const failed = firstValueFrom(auth.refreshToken());
    const rejection = expect(failed).rejects.toThrow('Spotify authorization expired');
    http.expectOne(tokenUrl).flush({error: 'invalid_grant'}, {status: 400, statusText: 'Bad Request'});
    await rejection;
    expect(values.get('spotifyAccessToken')).toBeUndefined();
    expect(values.get('cloudIdentityReady')).toBeUndefined();
    expect(values.get('spotifyUserId')).toBe('owner-A');
  });

  it('does not request cloud deletion when the revoked personal connection had no scheduled access', async () => {
    personal(); values.delete('cloudIdentityReady');
    const failed = firstValueFrom(auth.refreshToken());
    const rejection = expect(failed).rejects.toThrow('Spotify authorization expired');
    http.expectOne(tokenUrl).flush({error: 'invalid_grant'}, {status: 400, statusText: 'Bad Request'});
    await rejection;
    expect(values.get('spotifyRefreshToken')).toBeUndefined();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('does not persist a stale successful personal refresh after account replacement', async () => {
    personal(); const pending = firstValueFrom(auth.refreshToken()); const request = http.expectOne(tokenUrl);
    await lifecycle.invalidateAndDrain(); personal('owner-B'); const replacement = new Map(values);
    request.flush({access_token: 'old-A-response', refresh_token: 'old-A-rotated'});
    await pending;
    expect(values).toEqual(replacement);
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('coalesces session restoration and retains a usable local Spotify token over an older hosted provider token', async () => {
    const session = deferred<any>(); client.auth.getSession.mockReturnValue(session.promise);
    values.set('spotifyAccessToken', 'newer-local'); values.set('spotifyTokenExpiresAt', String(Date.now() + 3600000));
    const first = auth.restoreSessionFromSupabase(), second = auth.restoreSessionFromSupabase();
    await vi.waitFor(() => expect(client.auth.getSession).toHaveBeenCalledOnce());
    session.resolve({data: {session: {provider_token: 'older-provider', user: {id: 'cloud-owner', user_metadata: {provider_id: 'spotify-owner'}}}}, error: null});
    expect(await first).toBe(true); expect(await second).toBe(true);
    expect(values.get('spotifyAccessToken')).toBe('newer-local');
    expect(values.get('spotifyUserId')).toBe('spotify-owner');
    expect(values.get('supabaseUserId')).toBe('cloud-owner');
  });

  it('restores only the cloud identity of personal sessions without replacing personal Spotify tokens', async () => {
    personal(); client.auth.getSession.mockResolvedValue({data: {session: {provider_token: 'hosted-foreign', user: {id: 'personal-cloud', is_anonymous: true}}}, error: null});
    expect(await auth.restoreSessionFromSupabase()).toBe(true);
    expect(values.get('spotifyAccessToken')).toBe('access-owner-A');
    expect(values.get('supabaseUserId')).toBe('personal-cloud');
    expect(values.get('anonymousCloudIdentity')).toBe('true');
    expect(values.get('spotifyUserId')).toBe('owner-A');
  });

  it('discards deferred Supabase restoration after the account generation changes', async () => {
    const session = deferred<any>(); client.auth.getSession.mockReturnValue(session.promise);
    const restoration = auth.restoreSessionFromSupabase();
    await vi.waitFor(() => expect(client.auth.getSession).toHaveBeenCalledOnce());
    const exit = lifecycle.invalidateAndDrain(); personal('owner-B'); const replacement = new Map(values);
    session.resolve({data: {session: {provider_token: 'old-A', user: {id: 'cloud-A'}}}, error: null});
    expect(await restoration).toBe(false); await exit;
    expect(values).toEqual(replacement);
  });

  it('recovers a personal session by refreshing locally and returns false after a failed refresh', async () => {
    personal(); values.set('spotifyTokenExpiresAt', '1');
    const success = auth.recoverUsableSession();
    let request: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {request = http.match(tokenUrl)[0]; expect(request).toBeDefined();});
    request!.flush({access_token: 'recovered'});
    expect(await success).toBe(true);
    values.set('spotifyTokenExpiresAt', '1');
    const failure = auth.recoverUsableSession();
    await vi.waitFor(() => {request = http.match(tokenUrl)[0]; expect(request).toBeDefined();});
    request!.flush({error: 'offline'}, {status: 503, statusText: 'Unavailable'});
    expect(await failure).toBe(false);
    expect(values.get('spotifyRefreshToken')).toBe('refresh-owner-A');
  });


  it.each(['exchange', 'session'])('finishes a user-owned hosted callback and persists requested scopes (%s)', async kind => {
    const session = {provider_token: 'hosted-access', provider_refresh_token: 'hosted-refresh', user: {id: 'hosted-cloud', user_metadata: {provider_id: 'hosted-spotify'}}};
    client.auth.exchangeCodeForSession.mockResolvedValue({data: {session}, error: null});
    client.auth.getSession.mockResolvedValue({data: {session}, error: null});
    sessionStorage.setItem('analytify_spotify_pending_scopes', ' user-read-private  playlist-read-private user-read-private ');
    await firstValueFrom(kind === 'exchange' ? auth.exchangeSupabaseCodeForSession('isolated-code') : auth.handleCallbackSession());
    await auth.initialSyncPromise;
    expect(values.get('spotifyAccessToken')).toBe('hosted-access');
    expect(values.get('spotifyUserId')).toBe('hosted-spotify');
    expect(values.get('supabaseUserId')).toBe('hosted-cloud');
    expect(values.get('spotifyConnectionMode')).toBe('hosted');
    expect(values.get('spotifyGrantedScopes')).toBe('playlist-read-private user-read-private');
    expect(sessionStorage.getItem('analytify_spotify_pending_scopes')).toBeNull();
    expect(values.get('collaborationIdentityReady')).toBe('true');
    expect(values.get('cloudIdentityReady')).toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith('accept_current_terms', expect.objectContaining({p_acceptance_session_id: 'isolated-terms-session', p_connection_mode: 'hosted'}));
  });

  it('rejects an empty callback session without storing Spotify credentials', async () => {
    await expect(firstValueFrom(auth.handleCallbackSession())).rejects.toThrow('No active session found');
    expect(values.size).toBe(0);
  });

  it('rejects a session callback lacking provider access before publishing credentials', async () => {
    client.auth.getSession.mockResolvedValue({data: {session: {user: {id: 'cloud'}}}, error: null});
    await expect(firstValueFrom(auth.handleCallbackSession())).rejects.toThrow('provider token missing');
    expect(values.size).toBe(0);
  });

  it('propagates an explicit code-exchange failure without consuming pending consent scopes', async () => {
    const error = new Error('isolated OAuth denied');
    client.auth.exchangeCodeForSession.mockResolvedValue({data: {session: null}, error});
    sessionStorage.setItem('analytify_spotify_pending_scopes', 'user-read-private');
    await expect(firstValueFrom(auth.exchangeSupabaseCodeForSession('denied-code'))).rejects.toBe(error);
    expect(values.size).toBe(0);
    expect(sessionStorage.getItem('analytify_spotify_pending_scopes')).toBe('user-read-private');
  });

  it.each(['exchange', 'session'])('keeps a collaboration registration failure visible without stranding initial callback synchronization (%s)', async kind => {
    const session = {provider_token: 'hosted-access', user: {id: 'hosted-cloud'}};
    client.auth.exchangeCodeForSession.mockResolvedValue({data: {session}, error: null});
    client.auth.getSession.mockResolvedValue({data: {session}, error: null});
    client.functions.invoke.mockResolvedValue({data: null, error: {message: 'isolated profile unavailable'}});
    await firstValueFrom(kind === 'exchange' ? auth.exchangeSupabaseCodeForSession('isolated-code') : auth.handleCallbackSession());
    await expect(auth.initialSyncPromise).resolves.toBeUndefined();
    expect(values.get('spotifyAccessToken')).toBe('hosted-access');
    expect(values.get('collaborationIdentityReady')).toBeUndefined();
    expect(values.get('cloudIdentityReady')).toBeUndefined();
  });

  it.each(['exchange', 'session'])('registers hosted credentials only after enabled backup is observed (%s)', async kind => {
    const session = {provider_token: 'hosted-access', provider_refresh_token: 'hosted-refresh', user: {id: 'hosted-cloud'}};
    client.auth.exchangeCodeForSession.mockResolvedValue({data: {session}, error: null});
    client.auth.getSession.mockResolvedValue({data: {session}, error: null});
    client.from = () => ({select() {return this;}, eq() {return this;}, abortSignal() {return this;}, maybeSingle: async () => ({data: {backup_active: true}, error: null})});
    await firstValueFrom(kind === 'exchange' ? auth.exchangeSupabaseCodeForSession('isolated-code') : auth.handleCallbackSession());
    await auth.initialSyncPromise;
    expect(values.get('hosted-cloud_backup_active')).toBe('true');
    expect(values.get('cloudIdentityReady')).toBe('true');
    expect(client.functions.invoke.mock.calls.map((call: any) => call[1].body.action)).toEqual(['profile', 'store']);
    expect(client.functions.invoke).toHaveBeenLastCalledWith('spotify-credentials', {body: expect.objectContaining({profileUserId: 'hosted-cloud', connectionMode: 'hosted', clientId: null, refreshToken: 'hosted-refresh'})});
  });

  it('restores after a rejected session read by starting a new request and preserves personal identity without a session user', async () => {
    client.auth.getSession.mockResolvedValueOnce({data: {session: null}, error: new Error('isolated SDK read denied')});
    expect(await auth.restoreSessionFromSupabase()).toBe(false);
    personal(); client.auth.getSession.mockResolvedValueOnce({data: {session: {}}, error: null});
    expect(await auth.restoreSessionFromSupabase()).toBe(true);
    expect(values.get('spotifyUserId')).toBe('owner-A');
    expect(values.get('supabaseUserId')).toBe('cloud-owner-A');
  });

  it('returns immediately for a usable cached session and exposes missing token-expiry metadata as expired', async () => {
    values.set('spotifyAccessToken', 'usable'); values.set('spotifyTokenExpiresAt', String(Date.now() + 3600000));
    expect(await auth.recoverUsableSession()).toBe(true);
    expect(client.auth.getSession).not.toHaveBeenCalled();
    values.delete('spotifyTokenExpiresAt'); expect(auth.isTokenExpired()).toBe(true);
  });


  function authorizationBoundary() {
    const destinations: URL[] = [];
    const location = {assign: (href: string) => destinations.push(new URL(href))};
    vi.stubGlobal('window', new Proxy(window, {get(target, property) {
      return property === 'location' ? location : Reflect.get(target, property);
    }}));
    const digest = vi.fn(async (_algorithm: string, _bytes: Uint8Array) => new Uint8Array(32).fill(251).buffer);
    vi.stubGlobal('crypto', {getRandomValues: (bytes: Uint8Array) => bytes.fill(251), subtle: {digest}});
    return {destinations, digest};
  }

  it('starts personal PKCE with stored normalized consent and a URL-safe challenge bound to its verifier', async () => {
    const {destinations, digest} = authorizationBoundary();
    await auth.startPersonalAppAuthorization(' 12345678901234567890123456789012 ', '//external.invalid', [' user-read-private ', 'playlist-read-private', 'user-read-private'], 'existing_dev');
    expect(destinations).toHaveLength(1);
    const params = destinations[0].searchParams;
    const request = JSON.parse(sessionStorage.getItem('analytify_personal_spotify_auth_request')!);
    expect(request.clientId).toBe('12345678901234567890123456789012');
    expect(request.returnUrl).toBe('/new/playlists');
    expect(request.expectedSpotifyId).toBe('existing');
    expect(request.scopes).toEqual(['playlist-read-private', 'user-read-private']);
    expect(request.verifier).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(request.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get('state')).toBe(request.state);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toBe(btoa(String.fromCharCode(...new Uint8Array(32).fill(251))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'));
    expect(digest.mock.calls[0][0]).toBe('SHA-256');
    expect(new TextDecoder().decode(digest.mock.calls[0][1])).toBe(request.verifier);
    expect(params.get('scope')).toBe('playlist-read-private user-read-private');
    expect(params.get('show_dialog')).toBe('true');
    expect(params.get('response_type')).toBe('code');
  });

  it('validates personal app consent and client identifiers before saving authorization or navigating', async () => {
    const {destinations, digest} = authorizationBoundary();
    await expect(auth.startPersonalAppAuthorization('bad-client')).rejects.toThrow('32-character Client ID');
    expect(destinations).toEqual([]); expect(digest).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('analytify_personal_spotify_auth_request')).toBeNull();
    vi.mocked(TestBed.inject(TermsAcceptanceService).assertCurrentAcceptance).mockImplementation(() => {throw new Error('isolated terms required');});
    await expect(auth.startPersonalAppAuthorization('12345678901234567890123456789012')).rejects.toThrow('isolated terms required');
    expect(destinations).toEqual([]);
  });

  it('renews a personal connection with its existing scopes and requests playlist write scope incrementally', async () => {
    personal(); values.set('spotifyGrantedScopes', 'user-read-private playlist-read-private');
    const {destinations} = authorizationBoundary();
    await auth.renewSpotifyAuthorization('/stats');
    expect(destinations[0].searchParams.get('scope')).toBe('playlist-read-private user-read-private');
    expect(JSON.parse(sessionStorage.getItem('analytify_personal_spotify_auth_request')!).returnUrl).toBe('/new/stats');
    await auth.requestPlaylistWriteAuthorization('/playlists/source');
    expect(destinations[1].searchParams.get('scope')).toBe('playlist-modify-private playlist-read-private user-read-private');
    expect(values.get('spotifyAccessToken')).toBe('access-owner-A');
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(auth.hasSpotifyScope('playlist-read-private')).toBe(true);
    expect(auth.hasSpotifyScope('playlist-modify-private')).toBe(false);
    auth.clearPendingPersonalAppAuthorization();
    expect(sessionStorage.getItem('analytify_personal_spotify_auth_request')).toBeNull();
  });

  it.each(['renew', 'write'])('requires reconnect if the personal app Client ID is missing (%s)', async operation => {
    personal(); values.delete('personalSpotifyClientId');
    await expect(operation === 'renew' ? auth.renewSpotifyAuthorization() : auth.requestPlaylistWriteAuthorization()).rejects.toThrow('Reconnect your personal Spotify app');
    expect(client.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('renews hosted authorization silently with normalized existing scopes', async () => {
    values.set('spotifyGrantedScopes', 'user-read-private user-read-private');
    await auth.renewSpotifyAuthorization();
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({provider: 'spotify', options: expect.objectContaining({scopes: 'user-read-private', queryParams: {access_type: 'offline'}})});
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  function savedPersonalRequest(overrides: Record<string, unknown> = {}) {
    sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
      clientId: '12345678901234567890123456789012', state: 'expected-state', verifier: 'isolated-verifier',
      returnUrl: '/new/stats', scopes: ['user-read-private'], expectedSpotifyId: null, createdAt: Date.now(), ...overrides
    }));
  }

  it.each([
    {saved: null, message: 'missing or expired'},
    {saved: '{broken-json', message: 'saved Spotify authorization request is invalid'},
    {saved: JSON.stringify({state: 'expected-state', createdAt: Date.now(), clientId: 'bad'}), message: 'saved Spotify Client ID is invalid'}
  ])('rejects unusable saved personal authorization before sending credentials ($message)', async ({saved, message}) => {
    if (saved !== null) sessionStorage.setItem('analytify_personal_spotify_auth_request', saved);
    await expect(auth.handlePersonalAppCallback('isolated-code', 'expected-state')).rejects.toThrow(message);
    expect(sessionStorage.getItem('analytify_personal_spotify_auth_request')).toBeNull();
    http.expectNone(tokenUrl);
    expect(values.size).toBe(0);
  });

  it.each([{access_token: 'access-only'}, {refresh_token: 'refresh-only'}, {}])('keeps the previous session intact when a personal callback omits persistent tokens (%j)', async token => {
    personal(); savedPersonalRequest(); const previous = new Map(values);
    const callback = auth.handlePersonalAppCallback('isolated-code', 'expected-state');
    const rejected = expect(callback).rejects.toThrow('tokens required for a persistent session');
    http.expectOne(tokenUrl).flush(token);
    await rejected;
    expect(values).toEqual(previous);
    http.expectNone('https://api.spotify.com/v1/me');
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('rejects an identity-free Spotify profile without publishing the new personal tokens', async () => {
    personal(); savedPersonalRequest(); const previous = new Map(values);
    const callback = auth.handlePersonalAppCallback('isolated-code', 'expected-state');
    const rejected = expect(callback).rejects.toThrow('usable profile');
    http.expectOne(tokenUrl).flush({access_token: 'new-access', refresh_token: 'new-refresh'});
    let request: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {request = http.match('https://api.spotify.com/v1/me')[0]; expect(request).toBeDefined();});
    expect(request!.request.headers.get('Authorization')).toBe('Bearer new-access');
    request!.flush({display_name: 'Unidentified listener', images: []});
    await rejected;
    expect(values).toEqual(previous);
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

});
