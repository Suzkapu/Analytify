import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting, HttpTestingController} from '@angular/common/http/testing';
import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {firstValueFrom} from 'rxjs';
import {SpotifyAuthService} from './spotify-auth.service';
import {SessionLifecycleService} from './session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {TermsAcceptanceService} from '@core/legal/terms-acceptance.service';

let instance = 0;
function testJwt() {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({sub: 'isolated-cloud-owner', aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600})}.test-signature`;
}

describe('Hosted Spotify refresh through actual Supabase SDK transport', () => {
  let auth: SpotifyAuthService;
  let lifecycle: SessionLifecycleService;
  let values: Map<string, string>;
  let sdk: SupabaseClient;
  let requests: Array<{url: URL; body: any}>;
  let response: {status: number; body: any};
  let release: ((response: Response) => void) | null;
  let delayed: boolean;

  beforeEach(async () => {
    values = new Map(); requests = []; delayed = false; release = null;
    const user = {id: 'isolated-cloud-owner', app_metadata: {provider: 'spotify'}, user_metadata: {provider_id: 'isolated-spotify-owner'}};
    response = {status: 200, body: {access_token: testJwt(), refresh_token: 'sdk-rotated', expires_in: 3600, token_type: 'bearer', provider_token: 'spotify-refreshed', provider_refresh_token: 'spotify-provider-refresh', user}};
    sdk = createClient('https://isolated.invalid', 'isolated-public-fixture', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `isolated-hosted-refresh-${++instance}`},
      global: {fetch: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        expect(url.origin).toBe('https://isolated.invalid');
        if (url.pathname === '/auth/v1/user') return new Response(JSON.stringify(user), {status: 200, headers: {'Content-Type': 'application/json'}});
        if (url.pathname === '/auth/v1/logout') return new Response(null, {status: 204});
        expect(url.pathname).toBe('/auth/v1/token');
        requests.push({url, body: JSON.parse(String(init?.body))});
        if (delayed) return new Promise<Response>(resolve => release = resolve);
        return new Response(JSON.stringify(response.body), {status: response.status, headers: {'Content-Type': 'application/json'}});
      }}
    });
    const emptyClient = {auth: {getSession: async () => ({data: {session: null}, error: null})}};
    let activeClient: any = emptyClient;
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(),
      {provide: SupabaseService, useValue: new SupabaseService(async () => activeClient)},
      {provide: StorageService, useValue: {initFromDB: async () => {}, getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key)}},
      {provide: TermsAcceptanceService, useValue: {assertCurrentAcceptance: vi.fn()}}
    ]});
    auth = TestBed.inject(SpotifyAuthService); lifecycle = TestBed.inject(SessionLifecycleService);
    await auth.restoreSessionFromSupabase();
    const seeded = await sdk.auth.setSession({access_token: testJwt(), refresh_token: 'sdk-original-refresh'});
    expect(seeded.error).toBeNull();
    activeClient = sdk;
    // SupabaseService retains its resolved client; replace only that supplied boundary
    // after constructor bootstrap, preserving the SDK's actual refresh implementation.
    vi.spyOn(TestBed.inject(SupabaseService), 'getClient').mockResolvedValue(sdk);
    values.set('spotifyUserId', 'isolated-spotify-owner');
    values.set('supabaseUserId', 'isolated-cloud-owner');
    values.set('spotifyAccessToken', 'previous-spotify');
    values.set('spotifyRefreshToken', 'previous-provider-refresh');
  });
  afterEach(async () => {
    if (release) release(new Response(JSON.stringify(response.body), {status: response.status, headers: {'Content-Type': 'application/json'}}));
    const signedOut = await sdk.auth.signOut({scope: 'local'});
    expect(signedOut.error).toBeNull();
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
  });

  it('shares one SDK refresh and uses provider tokens without making a confidential Spotify token request', async () => {
    const first = firstValueFrom(auth.refreshToken()), second = firstValueFrom(auth.refreshToken());
    expect(await first).toEqual({access_token: 'spotify-refreshed'});
    expect(await second).toEqual({access_token: 'spotify-refreshed'});
    expect(requests).toHaveLength(1);
    expect(requests[0].url.searchParams.get('grant_type')).toBe('refresh_token');
    expect(requests[0].body.refresh_token).toBe('sdk-original-refresh');
    expect(values.get('spotifyAccessToken')).toBe('spotify-refreshed');
    expect(values.get('spotifyRefreshToken')).toBe('spotify-provider-refresh');
    expect(auth.isTokenExpired()).toBe(false);
    TestBed.inject(HttpTestingController).expectNone('https://accounts.spotify.com/api/token');
  });

  it('rejects missing provider tokens and allows a subsequent SDK refresh to recover', async () => {
    delete response.body.provider_token;
    const previous = new Map(values);
    await expect(firstValueFrom(auth.refreshToken())).rejects.toThrow('No Spotify provider token');
    expect(values).toEqual(previous);
    response.body.provider_token = 'retry-provider';
    expect(await firstValueFrom(auth.refreshToken())).toEqual({access_token: 'retry-provider'});
    expect(requests).toHaveLength(2);
    expect(values.get('spotifyAccessToken')).toBe('retry-provider');
  });

  it('surfaces denied SDK refresh without changing the current Spotify token cache', async () => {
    response = {status: 400, body: {error: 'invalid_grant', error_description: 'isolated revoked Supabase refresh', code: 'refresh_token_not_found'}};
    const previous = new Map(values);
    await expect(firstValueFrom(auth.refreshToken())).rejects.toThrow(/isolated revoked/);
    expect(values).toEqual(previous);
    expect(requests).toHaveLength(1);
  });

  it('does not persist a deferred hosted refresh from an obsolete generation into replacement credentials', async () => {
    delayed = true;
    const pending = firstValueFrom(auth.refreshToken());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await lifecycle.invalidateAndDrain();
    values.set('spotifyUserId', 'replacement-owner'); values.set('spotifyAccessToken', 'replacement-token');
    const replacement = new Map(values);
    release!(new Response(JSON.stringify(response.body), {status: 200, headers: {'Content-Type': 'application/json'}})); release = null;
    await pending;
    expect(values).toEqual(replacement);
  });
});
