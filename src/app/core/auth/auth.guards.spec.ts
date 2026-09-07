import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { redirectLoggedInGuard } from './redirect-logged-in.guard';
import { spotifyAuthGuard } from './spotify-auth.guard';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { AuthReturnUrlService } from './auth-return-url.service';

describe('authentication guards', () => {
    let auth: any;
    let storage: any;
    let router: any;
    let returnUrl: any;

    beforeEach(() => {
        auth = {
            isAuthenticated: vi.fn().mockName("SpotifyAuthService.isAuthenticated"),
            restoreSessionFromSupabase: vi.fn().mockName("SpotifyAuthService.restoreSessionFromSupabase"),
            recoverUsableSession: vi.fn().mockName("SpotifyAuthService.recoverUsableSession"),
            isTokenExpired: vi.fn().mockName("SpotifyAuthService.isTokenExpired"),
            refreshToken: vi.fn().mockName("SpotifyAuthService.refreshToken"),
            loginWithSupabase: vi.fn().mockName("SpotifyAuthService.loginWithSupabase"),
            renewSpotifyAuthorization: vi.fn().mockName("SpotifyAuthService.renewSpotifyAuthorization"),
            ensureInitialSync: vi.fn().mockName("SpotifyAuthService.ensureInitialSync")
        };
        storage = {
            initFromDB: vi.fn().mockName("StorageService.initFromDB")
        };
        router = {
            navigate: vi.fn().mockName("Router.navigate"),
            navigateByUrl: vi.fn().mockName("Router.navigateByUrl")
        };
        returnUrl = {
            remember: vi.fn().mockName("AuthReturnUrlService.remember"),
            consume: vi.fn().mockName("AuthReturnUrlService.consume")
        };
        returnUrl.consume.mockReturnValue('/playlists');

        storage.initFromDB.mockResolvedValue(undefined);
        auth.restoreSessionFromSupabase.mockResolvedValue(false);
        auth.recoverUsableSession.mockResolvedValue(false);
        auth.isTokenExpired.mockReturnValue(false);
        auth.refreshToken.mockReturnValue(of({ access_token: 'refreshed-token' }));
        auth.loginWithSupabase.mockResolvedValue(undefined);
        auth.renewSpotifyAuthorization.mockResolvedValue(undefined);
        auth.ensureInitialSync.mockResolvedValue(undefined);
        router.navigate.mockResolvedValue(true);

        TestBed.configureTestingModule({
            providers: [
                { provide: SpotifyAuthService, useValue: auth },
                { provide: StorageService, useValue: storage },
                { provide: Router, useValue: router },
                { provide: AuthReturnUrlService, useValue: returnUrl }
            ]
        });
    });

    it('restores the session before redirecting an unauthenticated visitor to login', async () => {
        auth.isAuthenticated.mockReturnValue(false);

        const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

        expect(Math.min(...vi.mocked(storage.initFromDB).mock.invocationCallOrder)).toBeLessThan(Math.min(...vi.mocked(auth.recoverUsableSession).mock.invocationCallOrder));
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
        expect(returnUrl.remember).toHaveBeenCalledWith(undefined);
        expect(allowed).toBe(false);
    });

    it('refreshes an expired token and starts the shared initial sync before allowing access', async () => {
        auth.isAuthenticated.mockReturnValue(true);
        auth.isTokenExpired.mockReturnValue(true);

        const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

        expect(auth.refreshToken).toHaveBeenCalled();
        expect(auth.ensureInitialSync).toHaveBeenCalled();
        expect(allowed).toBe(true);
    });

    it('does not block navigation on broad cloud-cache hydration', async () => {
        auth.isAuthenticated.mockReturnValue(true);
        auth.ensureInitialSync.mockReturnValue(new Promise<void>(() => { }));

        const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

        expect(auth.ensureInitialSync).toHaveBeenCalledTimes(1);
        expect(allowed).toBe(true);
    });

    it('starts re-authentication when an expired token cannot be refreshed', async () => {
        auth.isAuthenticated.mockReturnValue(true);
        auth.isTokenExpired.mockReturnValue(true);
        auth.refreshToken.mockReturnValue(throwError(() => new Error('refresh failed')));

        const allowed = await TestBed.runInInjectionContext(() => spotifyAuthGuard());

        expect(auth.renewSpotifyAuthorization).toHaveBeenCalledWith('/playlists');
        expect(auth.ensureInitialSync).not.toHaveBeenCalled();
        expect(allowed).toBe(false);
    });

    it('keeps logged-in users out of the login page', async () => {
        auth.isAuthenticated.mockReturnValue(true);

        const allowed = await TestBed.runInInjectionContext(() => redirectLoggedInGuard());

        expect(router.navigateByUrl).toHaveBeenCalledWith('/playlists');
        expect(allowed).toBe(false);
    });

    it('allows an unauthenticated visitor to see the login page', async () => {
        auth.isAuthenticated.mockReturnValue(false);

        const allowed = await TestBed.runInInjectionContext(() => redirectLoggedInGuard());

        expect(auth.recoverUsableSession).toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
        expect(allowed).toBe(true);
    });
});
