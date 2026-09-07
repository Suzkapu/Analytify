import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { CallbackComponent } from './callback.component';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { AuthReturnUrlService } from '@core/auth/auth-return-url.service';

describe('CallbackComponent', () => {
    let component: CallbackComponent;
    let fixture: ComponentFixture<CallbackComponent>;
    let router: any;
    let auth: any;

    beforeEach(() => {
        router = {
            navigate: vi.fn().mockName("Router.navigate"),
            navigateByUrl: vi.fn().mockName("Router.navigateByUrl")
        };
        router.navigateByUrl.mockResolvedValue(true);
        auth = {
            isAuthenticated: vi.fn().mockName("SpotifyAuthService.isAuthenticated"),
            exchangeSupabaseCodeForSession: vi.fn().mockName("SpotifyAuthService.exchangeSupabaseCodeForSession"),
            handleCallbackSession: vi.fn().mockName("SpotifyAuthService.handleCallbackSession"),
            clearSupabaseSession: vi.fn().mockName("SpotifyAuthService.clearSupabaseSession"),
            recoverUsableSession: vi.fn().mockName("SpotifyAuthService.recoverUsableSession")
        };
        auth.isAuthenticated.mockReturnValue(false);
        auth.exchangeSupabaseCodeForSession.mockReturnValue(of(null));
        auth.handleCallbackSession.mockReturnValue(of(null));
        auth.clearSupabaseSession.mockResolvedValue(undefined);
        auth.recoverUsableSession.mockResolvedValue(false);

        TestBed.configureTestingModule({
            declarations: [CallbackComponent],
            providers: [
                {
                    provide: ActivatedRoute,
                    useValue: { queryParams: of({ error: 'oauth_error' }) }
                },
                {
                    provide: Router,
                    useValue: router
                },
                { provide: AuthReturnUrlService, useValue: { consume: () => '/playlists' } },
                { provide: SpotifyAuthService, useValue: auth }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        fixture = TestBed.createComponent(CallbackComponent);
        component = fixture.componentInstance;
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('resumes an existing usable session instead of showing an OAuth error', async () => {
        auth.recoverUsableSession.mockResolvedValue(true);

        component.ngOnInit();
        await flushAsyncWork();

        expect(router.navigateByUrl).toHaveBeenCalledWith('/playlists');
        expect(component.errorMessage).toBeNull();
    });

    it('shows the OAuth error only when no usable session can be recovered', async () => {
        component.ngOnInit();
        await flushAsyncWork();

        expect(router.navigateByUrl).not.toHaveBeenCalled();
        expect(component.errorMessage).toBe('Spotify login error: oauth_error');
    });

    async function flushAsyncWork(): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
});
