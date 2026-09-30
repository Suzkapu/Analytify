import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { DesignNavigationService } from '@core/navigation/design-navigation.service';
import { CloudAccessComponent } from './cloud-access.component';

describe('CloudAccessComponent', () => {
  let fixture: ComponentFixture<CloudAccessComponent>;
  let component: CloudAccessComponent;
  let auth: any;
  let router: any;

  beforeEach(async () => {
    auth = {
      isBackupActive: vi.fn().mockReturnValue(false),
      hasCloudIdentity: vi.fn().mockReturnValue(false),
      enableBackup: vi.fn().mockResolvedValue(undefined),
      enableCloudIdentity: vi.fn().mockResolvedValue(undefined)
    };
    router = { navigateByUrl: vi.fn().mockResolvedValue(true), createUrlTree: vi.fn() };
    await TestBed.configureTestingModule({
      declarations: [CloudAccessComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ backup: '1', returnUrl: '/new/song-league' }) } } },
        { provide: Router, useValue: router },
        { provide: SpotifyAuthService, useValue: auth },
        DesignNavigationService
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(CloudAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('explains cloud backup and only enables it after confirmation', async () => {
    expect(fixture.nativeElement.textContent).toContain('encrypted Spotify refresh token');
    expect(auth.enableBackup).not.toHaveBeenCalled();
    await component.confirm();
    expect(auth.enableBackup).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/new/song-league');
  });

  it('keeps a failed request recoverable and announces the error', async () => {
    auth.enableBackup.mockRejectedValue(new Error('Spotify must be reconnected'));
    await component.confirm();
    fixture.detectChanges();
    expect(component.working).toBe(false);
    expect(fixture.nativeElement.querySelector('.error')?.textContent).toContain('reconnected');
  });

  it('cancels to the canonical playlists route', () => {
    component.cancel();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/playlists');
  });
});
