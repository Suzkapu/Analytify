import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {SharedModule} from '@shared/shared.module';

import {PushNotificationService} from '@core/notifications/push-notification.service';
import {SongLeagueService} from '@core/song-league/song-league.service';
import {SongLeagueClaimComponent} from './song-league-claim.component';

describe('SongLeagueClaimComponent notification prompt', () => {
  let fixture: ComponentFixture<SongLeagueClaimComponent>;
  let component: SongLeagueClaimComponent;
  let notifications: jasmine.SpyObj<PushNotificationService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const songLeague = jasmine.createSpyObj<SongLeagueService>('SongLeagueService', ['claimLeague']);
    songLeague.claimLeague.and.resolveTo('league-1');
    notifications = jasmine.createSpyObj<PushNotificationService>(
      'PushNotificationService', ['loadSettings', 'setSongLeagueEnabled']
    );
    notifications.loadSettings.and.resolveTo({
      supported: true, installedPwa: true, permission: 'default',
      deviceSubscribed: false, songLeagueEnabled: false, active: false
    });
    notifications.setSongLeagueEnabled.and.resolveTo({
      supported: true, installedPwa: true, permission: 'granted',
      deviceSubscribed: true, songLeagueEnabled: true, active: true
    });
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [SharedModule],
      declarations: [SongLeagueClaimComponent],
      providers: [
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'invite-token'}}}},
        {provide: Router, useValue: router},
        {provide: SongLeagueService, useValue: songLeague},
        {provide: PushNotificationService, useValue: notifications}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SongLeagueClaimComponent);
    component = fixture.componentInstance;
  });

  it('asks after joining when notifications are not active', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.league-notification-prompt') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Enable pick notifications?');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('enables notifications from the explicit prompt action and opens the league', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    await component.enableNotifications();

    expect(notifications.setSongLeagueEnabled).toHaveBeenCalledOnceWith(true);
    expect(router.navigate).toHaveBeenCalledOnceWith(['/song-league', 'league-1'], {replaceUrl: true});
  });

  it('lets the member continue without enabling notifications', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    component.skipNotifications();
    await fixture.whenStable();

    expect(notifications.setSongLeagueEnabled).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/song-league', 'league-1'], {replaceUrl: true});
  });

  it('skips the prompt when notifications are already active', async () => {
    notifications.loadSettings.and.resolveTo({
      supported: true, installedPwa: true, permission: 'granted',
      deviceSubscribed: true, songLeagueEnabled: true, active: true
    });

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.league-notification-prompt')).toBeNull();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/song-league', 'league-1'], {replaceUrl: true});
  });
});
