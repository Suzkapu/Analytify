import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {ActivationStart, provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {environment} from '@env/environment';
import {DesignV2ShellComponent} from './design-v2-shell.component';

@Component({standalone: true, template: '<h1>Isolated page</h1>'})
class PageStub {}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

describe('shell account through actual Spotify HTTP and admin service boundaries', () => {
  let spotifyId: string, cloudId: string | null;
  let logout: Subject<void>;
  let http: HttpTestingController;
  let cache: Map<string, string>;
  let adminRequests: ReturnType<typeof deferred<{data: boolean; error: null}>>[];
  let rpc: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    spotifyId = 'actor-a'; cloudId = 'cloud-a'; logout = new Subject<void>();
    cache = new Map([['actor-a_display_name', 'Cached A'], ['actor-a_profile_pic', 'https://test.invalid/a.png'],
      ['actor-b_display_name', 'Cached B'], ['actor-b_profile_pic', 'https://test.invalid/b.png']]);
    adminRequests = [];
    rpc = vi.fn(() => {const request = deferred<{data: boolean; error: null}>(); adminRequests.push(request); return request.promise;});
    TestBed.configureTestingModule({providers: [
      provideHttpClient(), provideHttpClientTesting(),
      {provide: SpotifyAuthService, useValue: {logout$: logout, getUserId: () => spotifyId,
        getSupabaseUserId: () => cloudId, isBackupActive: () => false, hasCloudIdentity: () => Boolean(cloudId)}},
      {provide: StorageService, useValue: {getItem: (key: string) => cache.get(key) ?? null, setItem: vi.fn()}},
      {provide: SupabaseService, useValue: {getClient: async () => ({rpc})}},
      provideRouter([{path: '', component: DesignV2ShellComponent, children: [
        {path: 'playlists', component: PageStub, data: designV2RouteData('playlists', 'Playlists', 'wide', 'library')},
        {path: 'stats', component: PageStub, data: designV2RouteData('stats', 'Stats', 'full', 'insights')},
        {path: 'login', component: PageStub, data: designV2RouteData('login', 'Sign in', 'form', 'account', {chromeMode: 'focus'})},
        {path: 'public', component: PageStub, data: designV2RouteData('public', 'Public', 'form', 'account', {chromeMode: 'public'})}
      ]}])
    ]});
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function start(path = '/playlists') {
    const harness = await RouterTestingHarness.create(path);
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
    return {harness, shell};
  }
  async function profileRequest() {
    return vi.waitFor(() => http.expectOne(`${environment.spotifyUrl}/me`));
  }
  // Finish the released HTTP/RPC promise chains before checking discarded results.
  async function settle() {await new Promise<void>(resolve => setTimeout(resolve, 0));}
  const profile = (actor: string) => ({id: `actor-${actor.toLowerCase()}`, display_name: `Fresh ${actor}`, images: [{url: `https://test.invalid/fresh-${actor.toLowerCase()}.png`}]});

  it('shows cached identity immediately and applies successful profile and trusted admin results', async () => {
    const {shell, harness} = await start();
    expect(shell.displayName()).toBe('Cached A'); expect(shell.profilePicUrl()).toBe('https://test.invalid/a.png');
    expect(shell.isAdmin()).toBe(false);
    (await profileRequest()).flush(profile('A')); adminRequests[0].resolve({data: true, error: null});
    await settle(); shell.toggleAccount(); harness.fixture.detectChanges();
    expect(harness.fixture.nativeElement.querySelector('#v2-account-title')?.textContent).toBe('Fresh A');
    expect(shell.profilePicUrl()).toBe('https://test.invalid/fresh-a.png'); expect(shell.isAdmin()).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('is_app_admin');
  });

  it('keeps cached offline identity usable and denies administration after service failure', async () => {
    const {shell} = await start();
    (await profileRequest()).flush('offline', {status: 503, statusText: 'Unavailable'});
    adminRequests[0].reject(new Error('isolated RPC failure')); await settle();
    expect(shell.displayName()).toBe('Cached A'); expect(shell.profilePicUrl()).toBe('https://test.invalid/a.png');
    expect(shell.isAdmin()).toBe(false);
  });

  it.each(['/login', '/public'])('rejects late account results after entering %s and reloads on return', async destination => {
    const {shell, harness} = await start(); const old = await profileRequest();
    await harness.navigateByUrl(destination);
    if (!old.cancelled) old.flush(profile('A')); adminRequests[0].resolve({data: true, error: null}); await settle();
    expect(shell.displayName()).toBe('Your account'); expect(shell.profilePicUrl()).toBeNull(); expect(shell.isAdmin()).toBe(false);
    await harness.navigateByUrl('/stats');
    expect(shell.displayName()).toBe('Cached A');
    (await profileRequest()).flush(profile('A')); await settle();
    expect(shell.displayName()).toBe('Fresh A');
  });

  it('reuses the same pending account retrieval across app routes', async () => {
    const {shell, harness} = await start(); const pending = await profileRequest();
    await harness.navigateByUrl('/stats');
    http.expectNone(`${environment.spotifyUrl}/me`); expect(rpc).toHaveBeenCalledOnce();
    pending.flush(profile('A')); adminRequests[0].resolve({data: false, error: null}); await settle();
    expect(shell.displayName()).toBe('Fresh A');
  });

  it.each(['spotify', 'cloud'])('rejects replaced %s identity and hydrates the current account', async identity => {
    const {shell, harness} = await start(); const old = await profileRequest();
    if (identity === 'spotify') spotifyId = 'actor-b'; else cloudId = 'cloud-b';
    await harness.navigateByUrl('/stats');
    expect(shell.displayName()).toBe(identity === 'spotify' ? 'Cached B' : 'Cached A');
    const current = await profileRequest();
    if (!old.cancelled) old.flush(profile('A')); adminRequests[0].resolve({data: true, error: null}); await settle();
    expect(shell.displayName()).toBe(identity === 'spotify' ? 'Cached B' : 'Cached A'); expect(shell.isAdmin()).toBe(false);
    current.flush({...profile('B'), id: spotifyId});
    if (identity === 'cloud') adminRequests[1].resolve({data: false, error: null});
    await settle(); expect(shell.displayName()).toBe('Fresh B');
    // The unchanged cloud principal legitimately reuses its existing admin RPC.
    expect(shell.isAdmin()).toBe(identity === 'spotify');
  });

  it('clears chrome on logout and rejects both late service results', async () => {
    const {shell} = await start(); const old = await profileRequest();
    logout.next(); await TestBed.inject(SessionLifecycleService).invalidateAndDrain();
    expect(shell.displayName()).toBe('Your account'); expect(shell.profilePicUrl()).toBeNull();
    if (!old.cancelled) old.flush(profile('A')); adminRequests[0].resolve({data: true, error: null}); await settle();
    expect(shell.displayName()).toBe('Your account'); expect(shell.profilePicUrl()).toBeNull(); expect(shell.isAdmin()).toBe(false);
  });

  it('rejects old results after session generation changes even if identifiers match', async () => {
    const {shell} = await start(); const old = await profileRequest();
    await TestBed.inject(SessionLifecycleService).invalidateAndDrain();
    if (!old.cancelled) old.flush(profile('A')); adminRequests[0].resolve({data: true, error: null}); await settle();
    expect(shell.displayName()).toBe('Cached A'); expect(shell.isAdmin()).toBe(false);
  });

  it.each(['spotify', 'cloud'])('rejects a late response after %s identity changes without navigation', async identity => {
    const {shell} = await start(); const old = await profileRequest();
    if (identity === 'spotify') spotifyId = 'actor-b'; else cloudId = 'cloud-b';
    if (!old.cancelled) old.flush(profile('A')); adminRequests[0].resolve({data: true, error: null}); await settle();
    expect(shell.displayName()).toBe('Cached A'); expect(shell.profilePicUrl()).toBe('https://test.invalid/a.png');
    expect(shell.isAdmin()).toBe(false);
  });

  it('keeps a local-only account usable without any administrator RPC', async () => {
    cloudId = null;
    const {shell} = await start(); (await profileRequest()).flush(profile('A')); await settle();
    expect(shell.displayName()).toBe('Fresh A'); expect(shell.isAdmin()).toBe(false); expect(rpc).not.toHaveBeenCalled();
  });

  it('allows trusted current administration after profile failure without losing cached identity', async () => {
    const {shell} = await start();
    adminRequests[0].resolve({data: true, error: null});
    (await profileRequest()).flush('offline', {status: 503, statusText: 'Unavailable'}); await settle();
    expect(shell.displayName()).toBe('Cached A'); expect(shell.isAdmin()).toBe(true);
  });

  it('keeps fresh profile information when administrator lookup fails', async () => {
    const {shell} = await start();
    adminRequests[0].reject(new Error('isolated RPC failure'));
    (await profileRequest()).flush(profile('A')); await settle();
    expect(shell.displayName()).toBe('Fresh A'); expect(shell.isAdmin()).toBe(false);
  });

  it.each(['public', 'logout', 'destroy', 'replacement'])('cancels obsolete profile HTTP work on %s', async reason => {
    const {shell, harness} = await start(); const old = await profileRequest();
    if (reason === 'public') await harness.navigateByUrl('/public');
    else if (reason === 'logout') logout.next();
    else if (reason === 'destroy') harness.fixture.destroy();
    else {spotifyId = 'actor-b'; await harness.navigateByUrl('/stats');}
    expect(old.cancelled).toBe(true);
    adminRequests[0].resolve({data: false, error: null});
    if (reason === 'replacement') (await profileRequest()).flush({...profile('B'), id: spotifyId});
    await settle(); expect(shell.isAdmin()).toBe(false);
  });

  it('cancels old profile work before a public destination activates', async () => {
    const {harness} = await start(); const old = await profileRequest();
    const cancellations: boolean[] = [];
    const subscription = TestBed.inject(Router).events.subscribe(event => {
      if (event instanceof ActivationStart && event.snapshot.data['chromeMode'] === 'public') cancellations.push(old.cancelled);
    });
    await harness.navigateByUrl('/public'); subscription.unsubscribe();
    expect(cancellations).toEqual([true]);
    adminRequests[0].resolve({data: false, error: null}); await settle();
  });

  it('does not publish delayed account results after shell destruction', async () => {
    const {shell, harness} = await start(); const old = await profileRequest();
    const prior = {name: shell.displayName(), picture: shell.profilePicUrl()};
    harness.fixture.destroy(); if (!old.cancelled) old.flush(profile('A')); adminRequests[0].resolve({data: true, error: null}); await settle();
    expect({name: shell.displayName(), picture: shell.profilePicUrl()}).toEqual(prior); expect(shell.isAdmin()).toBe(false);
  });

  it('never calls either service on focus or public chrome until entering an app route', async () => {
    const {shell, harness} = await start('/login');
    await harness.navigateByUrl('/public'); http.expectNone(`${environment.spotifyUrl}/me`); expect(rpc).not.toHaveBeenCalled();
    await harness.navigateByUrl('/stats');
    (await profileRequest()).flush({}); adminRequests[0].resolve({data: false, error: null}); await settle();
    expect(shell.displayName()).toBe('Cached A'); expect(shell.profilePicUrl()).toBeNull();
  });
});
