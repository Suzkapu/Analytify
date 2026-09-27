import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {RouterTestingModule} from '@angular/router/testing';
import {describe, expect, it, beforeEach, vi} from 'vitest';

import {AdminService} from '@core/admin/admin.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SongLeagueService} from '@core/song-league/song-league.service';
import {SiteSettingsService} from '@core/settings/site-settings.service';
import {SharedModule} from '@shared/shared.module';
import {SongLeagueHomeComponent} from './song-league-home.component';

describe('SongLeagueHomeComponent', () => {
  let fixture: ComponentFixture<SongLeagueHomeComponent>;
  let service: any;

  beforeEach(() => {
    service = {
      listLeagues: vi.fn().mockImplementation((closed?: boolean) => Promise.resolve(closed ? [] : [{
        id: 'league', ownerUserId: 'owner', name: 'Friday Finds', timezone: 'Europe/Vienna',
        ownerDisplayName: 'Owner', ownerImageUrl: '', playlistRevision: 0, maxMembers: 5,
        isDemo: false, createdAt: '2026-09-01T00:00:00Z'
      }])),
      createLeague: vi.fn()
    };
    TestBed.configureTestingModule({
      imports: [SharedModule, RouterTestingModule],
      declarations: [SongLeagueHomeComponent],
      providers: [
        {provide: SongLeagueService, useValue: service},
        {provide: SpotifyAuthService, useValue: {isBackupActive: () => true}},
        {provide: SiteSettingsService, useValue: {load: () => Promise.resolve({allowSongLeagueCreation: true})}},
        {provide: AdminService, useValue: {isAdmin: () => Promise.resolve(false)}}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SongLeagueHomeComponent);
  });

  it('renders populated and closed-history league states without exposing creation first', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Friday Finds');
    expect(fixture.nativeElement.textContent).toContain('Active leagues');
    expect(fixture.nativeElement.querySelector('.league-create-card')).toBeNull();
  });

  it('renders an explicit empty state', async () => {
    service.listLeagues.mockResolvedValue([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No leagues yet');
  });

  it('renders a recoverable load error', async () => {
    service.listLeagues.mockRejectedValue(new Error('League data unavailable'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('League data unavailable');
  });
});
