import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginPageComponent } from './login-page.component';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { AuthReturnUrlService } from '@core/auth/auth-return-url.service';
import { TermsAcceptanceService } from '@core/legal/terms-acceptance.service';
import { FormsModule } from '@angular/forms';
import {DESIGN_VARIANT} from '@core/navigation/design-navigation';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';

describe('LoginPageComponent', () => {
    let component: LoginPageComponent;
    let fixture: ComponentFixture<LoginPageComponent>;
    let returnUrl: {consume: ReturnType<typeof vi.fn>; remember: ReturnType<typeof vi.fn>};
    let auth: {isAuthenticated: ReturnType<typeof vi.fn>; loginWithSupabase: ReturnType<typeof vi.fn>};

    beforeEach(() => {
        returnUrl = {consume: vi.fn().mockReturnValue('/new/playlists'), remember: vi.fn()};
        auth = {isAuthenticated: vi.fn().mockReturnValue(false), loginWithSupabase: vi.fn().mockResolvedValue(undefined)};
        TestBed.configureTestingModule({
            declarations: [LoginPageComponent],
            imports: [FormsModule],
            providers: [
                {
                    provide: SpotifyAuthService,
                    useValue: auth
                },
                {
                    provide: StorageService,
                    useValue: { initFromDB: () => Promise.resolve() }
                },
                {
                    provide: Router,
                    useValue: { navigate: vi.fn().mockName('navigate'), navigateByUrl: vi.fn().mockName('navigateByUrl') }
                },
                { provide: AuthReturnUrlService, useValue: returnUrl },
                {provide: DESIGN_VARIANT, useValue: 'new'},
                DesignNavigationService,
                {
                    provide: TermsAcceptanceService,
                    useValue: {hasCurrentAcceptance: () => false, acceptCurrent: vi.fn().mockName('acceptCurrent')}
                }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        fixture = TestBed.createComponent(LoginPageComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('renders hosted and personal-app login without promoting Compare Room', () => {
        const element: HTMLElement = fixture.nativeElement;

        expect(element.querySelector('main.login-wrapper')).not.toBeNull();
        expect(element.querySelector('.login-shell')).not.toBeNull();
        expect(element.querySelectorAll('.login-benefits li').length).toBe(3);
        expect(element.querySelector('.login-card-header > .login-brand')).not.toBeNull();
        expect(element.querySelector('.login-intro > .login-brand')).toBeNull();
        expect(element.querySelector('.login-card-icon')).toBeNull();
        expect(element.querySelector('button.login-spotify-button')).not.toBeNull();
        expect(element.querySelector('button.personal-app-button')).not.toBeNull();
        expect(element.querySelector('a.compare-room-button')).toBeNull();
        expect(element.textContent).not.toContain('Open a Compare Room');
        expect(element.textContent).toContain('Explore your playlists.');
        expect(element.textContent).toContain('Browse, search, share, and organize');
        expect(element.textContent).toContain('Stored on this device');
        expect(element.textContent).toContain('saved songs, playlists');
        expect(element.textContent).toContain('top songs and artists');
        expect(element.textContent).toContain('recently played songs');
        expect(element.textContent).toContain('playlist write access only');
        expect(element.textContent).toContain('never reads your password or payment details');
        expect(element.textContent).not.toContain('focused dashboard');
    });

    it('keeps every Spotify authorization entry point disabled until terms are accepted', () => {
        const element: HTMLElement = fixture.nativeElement;
        expect((element.querySelector('.login-spotify-button') as HTMLButtonElement).disabled).toBe(true);
        expect((element.querySelector('.personal-app-button') as HTMLButtonElement).disabled).toBe(true);

        component.termsAccepted = true;
        fixture.detectChanges();

        expect((element.querySelector('.login-spotify-button') as HTMLButtonElement).disabled).toBe(false);
        expect((element.querySelector('.personal-app-button') as HTMLButtonElement).disabled).toBe(false);
    });

    it('records a v2 return destination before hosted Spotify authorization', async () => {
        component.termsAccepted = true;
        await component.login();
        expect(returnUrl.remember).toHaveBeenCalledWith('/new/playlists');
        expect(auth.loginWithSupabase).toHaveBeenCalledTimes(1);
    });

    it('opens personal Spotify setup inside v2 with a v2 return URL', () => {
        component.termsAccepted = true;
        component.openPersonalApp();
        const router = TestBed.inject(Router);
        expect(router.navigate).toHaveBeenCalledWith(
            ['/new', 'spotify', 'connect'],
            {queryParams: {returnUrl: '/new/playlists'}}
        );
    });
});
