import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { DesignNavigationService } from '@core/navigation/design-navigation.service';
import { PersonalSpotifyCallbackComponent } from './personal-spotify-callback.component';

describe('PersonalSpotifyCallbackComponent', () => {
  let fixture: ComponentFixture<PersonalSpotifyCallbackComponent>;
  let auth: any;
  let router: any;
  let query: Record<string, string>;

  beforeEach(async () => {
    query = {};
    auth = {
      clearPendingPersonalAppAuthorization: vi.fn(),
      handlePersonalAppCallback: vi.fn().mockResolvedValue('/new/playlists')
    };
    router = { navigateByUrl: vi.fn().mockResolvedValue(true), createUrlTree: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [PersonalSpotifyCallbackComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap(query); } } } },
        { provide: Router, useValue: router },
        { provide: SpotifyAuthService, useValue: auth },
        DesignNavigationService
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
  });

  it('shows an actionable error for an incomplete callback', async () => {
    fixture = TestBed.createComponent(PersonalSpotifyCallbackComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('complete authorization response');
    expect(fixture.componentInstance.navigation.commands('spotifyConnect')).toEqual(['/spotify', 'connect']);
  });

  it('finishes the callback and preserves its v2 destination', async () => {
    query = { code: 'code', state: 'state' };
    fixture = TestBed.createComponent(PersonalSpotifyCallbackComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(auth.handlePersonalAppCallback).toHaveBeenCalledWith('code', 'state');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/new/playlists');
  });
});
