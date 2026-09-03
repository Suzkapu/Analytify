import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {SharedModule} from '@shared/shared.module';

import {PushNotificationService} from '@core/notifications/push-notification.service';
import {SongLeagueService} from '@core/song-league/song-league.service';
import {SongLeagueDetailComponent} from './song-league-detail.component';

describe('SongLeagueDetailComponent notifications', () => {
  let fixture: ComponentFixture<SongLeagueDetailComponent>;
  let component: SongLeagueDetailComponent;
  let notifications: jasmine.SpyObj<PushNotificationService>;

  beforeEach(() => {
    notifications = jasmine.createSpyObj<PushNotificationService>(
      'PushNotificationService', ['loadSettings', 'setSongLeagueEnabled']
    );
    notifications.loadSettings.and.resolveTo({
      supported: true, installedPwa: true, permission: 'granted',
      deviceSubscribed: true, songLeagueEnabled: true
    });
    notifications.setSongLeagueEnabled.and.resolveTo({
      supported: true, installedPwa: true, permission: 'granted',
      deviceSubscribed: true, songLeagueEnabled: false
    });
    const songLeague = jasmine.createSpyObj<SongLeagueService>('SongLeagueService', [
      'currentUserId', 'loadDashboard', 'subscribeToLeague', 'isFridayInTimezone'
    ]);
    songLeague.currentUserId.and.resolveTo('member');
    songLeague.loadDashboard.and.resolveTo({
      league: {
        id: 'league', ownerUserId: 'owner', name: 'Friday Finds', timezone: 'Europe/Vienna',
        ownerDisplayName: 'Owner', ownerImageUrl: '', playlistRevision: 0, isDemo: false,
        createdAt: '2026-09-01T00:00:00Z'
      },
      members: [{leagueId: 'league', userId: 'member', role: 'member', displayName: 'Member', imageUrl: '', joinedAt: 'now'}],
      standings: [], recommendations: [], playlists: [], breakdownByRecommender: new Map()
    });
    songLeague.subscribeToLeague.and.returnValue(jasmine.createSpy('unsubscribe'));
    songLeague.isFridayInTimezone.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [SongLeagueDetailComponent],
      providers: [
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'league'}}}},
        {provide: Router, useValue: {navigate: jasmine.createSpy('navigate')}},
        {provide: SongLeagueService, useValue: songLeague},
        {provide: PushNotificationService, useValue: notifications}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SongLeagueDetailComponent);
    component = fixture.componentInstance;
  });

  it('loads notification preferences in parallel and exposes an in-league off switch', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const control = fixture.nativeElement.querySelector('.league-notification-control') as HTMLElement;
    expect(control.textContent).toContain('Pick-opening notifications');
    expect(control.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');

    await component.toggleSongLeagueNotifications();

    expect(notifications.setSongLeagueEnabled).toHaveBeenCalledOnceWith(false);
    expect(component.notificationSettings.songLeagueEnabled).toBeFalse();
  });
});
