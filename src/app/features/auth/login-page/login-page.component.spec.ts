import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginPageComponent } from './login-page.component';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { AuthReturnUrlService } from '@core/auth/auth-return-url.service';
import { TermsAcceptanceService } from '@core/legal/terms-acceptance.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';

describe('LoginPageComponent', () => {
    let component: LoginPageComponent;
    let fixture: ComponentFixture<LoginPageComponent>;
    let returnUrl: {consume: ReturnType<typeof vi.fn>; remember: ReturnType<typeof vi.fn>};
    let auth: {isAuthenticated: ReturnType<typeof vi.fn>; loginWithSupabase: ReturnType<typeof vi.fn>};

    beforeEach(() => {
        returnUrl = {consume: vi.fn().mockReturnValue('/playlists'), remember: vi.fn()};
        auth = {isAuthenticated: vi.fn().mockReturnValue(false), loginWithSupabase: vi.fn().mockResolvedValue(undefined)};
        TestBed.configureTestingModule({
            declarations: [LoginPageComponent],
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

    it('updates terms consent from the native checkbox in both directions', async () => {
        await fixture.whenStable();
        const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
        checkbox.click();
        fixture.detectChanges();
        expect(component.termsAccepted).toBe(true);
        expect(fixture.nativeElement.querySelector('.login-spotify-button').disabled).toBe(false);
        checkbox.click();
        fixture.detectChanges();
        expect(component.termsAccepted).toBe(false);
        expect(fixture.nativeElement.querySelector('.login-spotify-button').disabled).toBe(true);
    });

    it('renders restored consent after asynchronous storage initialization', async () => {
        fixture.autoDetectChanges();
        vi.spyOn(TestBed.inject(TermsAcceptanceService), 'hasCurrentAcceptance').mockReturnValue(true);
        await component.ngOnInit();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('input[type="checkbox"]').checked).toBe(true);
    });

    it('announces an asynchronous login failure without another user interaction', async () => {
        fixture.autoDetectChanges();
        component.termsAccepted = true;
        auth.loginWithSupabase.mockRejectedValue(new Error('Spotify unavailable'));
        await component.login();
        await fixture.whenStable();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Spotify unavailable');
    });

    it('renders hosted and personal-app login without promoting Compare Room', () => {
        const element: HTMLElement = fixture.nativeElement;

        expect(element.querySelector('.login-wrapper')).not.toBeNull();
        expect(element.querySelector('main')).toBeNull();
        expect(element.querySelector('.login-shell')).not.toBeNull();
        expect(element.querySelectorAll('.login-benefits li').length).toBe(3);
        expect(element.querySelector('.login-card-header > .login-brand')).not.toBeNull();
        expect(element.querySelector('.login-intro > .login-brand')).toBeNull();
        expect(element.querySelector('.login-card-icon')).toBeNull();
        expect(element.querySelector('button.login-spotify-button')).not.toBeNull();
        expect(element.querySelector('button.personal-app-button')).toBeNull();
        expect(element.querySelector('button.advanced-options-button')).not.toBeNull();
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
        (element.querySelector('.advanced-options-button') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect((element.querySelector('.personal-app-button') as HTMLButtonElement).disabled).toBe(true);
        expect(element.querySelector('.personal-app-button')?.textContent).toContain('Spotify API application');

        component.termsAccepted = true;
        fixture.detectChanges();

        expect((element.querySelector('.login-spotify-button') as HTMLButtonElement).disabled).toBe(false);
        expect((element.querySelector('.personal-app-button') as HTMLButtonElement).disabled).toBe(false);
    });

    it('records the canonical return destination before hosted Spotify authorization', async () => {
        component.termsAccepted = true;
        await component.login();
        expect(returnUrl.remember).toHaveBeenCalledWith('/playlists');
        expect(auth.loginWithSupabase).toHaveBeenCalledTimes(1);
    });

    it('opens personal Spotify setup with a canonical return URL', () => {
        component.termsAccepted = true;
        component.showAdvancedOptions = true;
        fixture.detectChanges();
        component.openPersonalApp();
        const router = TestBed.inject(Router);
        expect(router.navigate).toHaveBeenCalledWith(
            ['/spotify', 'connect'],
            {queryParams: {returnUrl: '/playlists'}}
        );
    });

    it('keeps terms metadata outside the main consent decision', () => {
        const details = fixture.nativeElement.querySelector('details.terms-version') as HTMLDetailsElement;
        expect(details.open).toBe(false);
        expect(details.querySelector('summary')?.textContent).toContain('Terms version');
    });

    it('shows a recoverable hosted OAuth error without navigating', async () => {
        auth.loginWithSupabase.mockRejectedValue(new Error('Spotify is temporarily unavailable'));
        component.termsAccepted = true;
        await component.login();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('temporarily unavailable');
    });
});
