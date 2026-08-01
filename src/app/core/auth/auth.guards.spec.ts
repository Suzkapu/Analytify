import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {of, throwError} from 'rxjs';
import {redirectLoggedInGuard} from './redirect-logged-in.guard';
import {spotifyAuthGuard} from './spotify-auth.guard';
import {SpotifyAuthService} from './spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';

describe('authentication guards', () => {
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let storage: jasmine.SpyObj<StorageService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', [
      'isAuthenticated',
      'restoreSessionFromSupabase',
      'isTokenExpired',
      'refreshToken',
      'loginWithSupabase',
      'ensureInitialSync'
    ]);
    storage = jasmine.createSpyObj<StorageService>('StorageService', ['initFromDB']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    storage.initFromDB.and.resolveTo();
    auth.restoreSessionFromSupabase.and.resolveTo(false);
    auth.isTokenExpired.and.returnValue(false);
    auth.refreshToken.and.returnValue(of({ access_token: 'refreshed-token' }));
    auth.loginWithSupabase.and.resolveTo();
    auth.ensureInitialSync.and.resolveTo();
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        {provide: SpotifyAuthService, useValue: auth},
        {provide: StorageService, useValue: storage},
        {provide: Router, useValue: router}
      ]
    });
  });

  it('restores the session before redirecting an unauthenticated visitor to login', async () => {
    auth.isAuthenticated.and.returnValue(false);

    const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

    expect(storage.initFromDB).toHaveBeenCalledBefore(auth.restoreSessionFromSupabase);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(allowed).toBeFalse();
  });

  it('refreshes an expired token and completes the initial sync before allowing access', async () => {
    auth.isAuthenticated.and.returnValue(true);
    auth.isTokenExpired.and.returnValue(true);

    const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

    expect(auth.refreshToken).toHaveBeenCalled();
    expect(auth.ensureInitialSync).toHaveBeenCalled();
    expect(allowed).toBeTrue();
  });

  it('starts re-authentication when an expired token cannot be refreshed', async () => {
    auth.isAuthenticated.and.returnValue(true);
    auth.isTokenExpired.and.returnValue(true);
    auth.refreshToken.and.returnValue(throwError(() => new Error('refresh failed')));

    const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

    expect(auth.loginWithSupabase).toHaveBeenCalledWith(false);
    expect(auth.ensureInitialSync).not.toHaveBeenCalled();
    expect(allowed).toBeFalse();
  });

  it('keeps logged-in users out of the login page', async () => {
    auth.isAuthenticated.and.returnValue(true);

    const allowed = await TestBed.runInInjectionContext(() => redirectLoggedInGuard());

    expect(router.navigate).toHaveBeenCalledWith(['/playlists']);
    expect(allowed).toBeFalse();
  });

  it('allows an unauthenticated visitor to see the login page', async () => {
    auth.isAuthenticated.and.returnValue(false);

    const allowed = await TestBed.runInInjectionContext(() => redirectLoggedInGuard());

    expect(auth.restoreSessionFromSupabase).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(allowed).toBeTrue();
  });
});
