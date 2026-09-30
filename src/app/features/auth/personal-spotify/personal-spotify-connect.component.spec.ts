import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { TermsAcceptanceService } from '@core/legal/terms-acceptance.service';
import { DesignNavigationService } from '@core/navigation/design-navigation.service';
import { PersonalSpotifyConnectComponent } from './personal-spotify-connect.component';

describe('PersonalSpotifyConnectComponent', () => {
  let fixture: ComponentFixture<PersonalSpotifyConnectComponent>;
  let component: PersonalSpotifyConnectComponent;
  let auth: any;
  let router: any;
  let terms: any;

  beforeEach(async () => {
    auth = {
      getPersonalSpotifyClientId: vi.fn().mockReturnValue(''),
      getUserId: vi.fn().mockReturnValue('spotify-user'),
      resolvePersonalSpotifyClientId: vi.fn().mockResolvedValue('a'.repeat(32)),
      startPersonalAppAuthorization: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(false)
    };
    router = { navigate: vi.fn(), navigateByUrl: vi.fn().mockResolvedValue(true) };
    terms = { hasCurrentAcceptance: vi.fn().mockReturnValue(false), acceptCurrent: vi.fn() };

    await TestBed.configureTestingModule({
      declarations: [PersonalSpotifyConnectComponent],
      imports: [FormsModule],
      providers: [
        { provide: SpotifyAuthService, useValue: auth },
        { provide: TermsAcceptanceService, useValue: terms },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/new/stats' }) } } },
        { provide: Router, useValue: router },
        DesignNavigationService
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(PersonalSpotifyConnectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders labelled setup fields and leaves consent unselected', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect((element.querySelector('#personal-spotify-id') as HTMLInputElement).labels?.[0].textContent).toContain('Spotify user ID');
    expect((element.querySelector('#personal-client-id') as HTMLInputElement).labels?.[0].textContent).toContain('Spotify Client ID');
    expect(component.termsAccepted).toBe(false);
    expect((element.querySelector('.primary') as HTMLButtonElement).disabled).toBe(true);
  });

  it('resolves a saved app and starts authorization with the v2 return destination', async () => {
    component.termsAccepted = true;
    await component.connect();

    expect(auth.resolvePersonalSpotifyClientId).toHaveBeenCalledWith('spotify-user');
    expect(terms.acceptCurrent).toHaveBeenCalledOnce();
    expect(auth.startPersonalAppAuthorization).toHaveBeenCalledWith('a'.repeat(32), '/new/stats', undefined, 'spotify-user');
  });

  it('associates recoverable validation errors with both identity inputs', async () => {
    component.termsAccepted = true;
    component.spotifyId = ' ';
    await component.connect();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Spotify user ID');
    expect(fixture.nativeElement.querySelector('#personal-spotify-id')?.getAttribute('aria-describedby')).toBe('personal-connect-error');
  });

  it('rejects an external return URL and cancels to the canonical login', () => {
    const route = TestBed.inject(ActivatedRoute) as any;
    route.snapshot.queryParamMap = convertToParamMap({ returnUrl: '//attacker.example' });
    component.ngOnInit();
    component.cancel();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
