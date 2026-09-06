import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {Subject} from 'rxjs';

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
      deviceSubscribed: true, songLeagueEnabled: true, songLeagueSongAddedEnabled: false,
      songLeagueMember: true, statsAccessRequestsEnabled: true,
      active: true, songAddedActive: false, statsAccessActive: true
    });
    notifications.setSongLeagueEnabled.and.resolveTo({
      supported: true, installedPwa: true, permission: 'granted',
      deviceSubscribed: true, songLeagueEnabled: false, songLeagueSongAddedEnabled: false,
      songLeagueMember: true, statsAccessRequestsEnabled: true,
      active: false, songAddedActive: false, statsAccessActive: true
    });
    const songLeague = jasmine.createSpyObj<SongLeagueService>('SongLeagueService', [
      'currentUserId', 'loadDashboard', 'ensureMemberReadyForLeague',
      'subscribeToLeague', 'isFridayInTimezone', 'submitRecommendation',
      'syncWeeklyPlaylists', 'setMemberLimit'
    ]);
    songLeague.currentUserId.and.resolveTo('member');
    songLeague.loadDashboard.and.resolveTo({
      league: {
        id: 'league', ownerUserId: 'owner', name: 'Friday Finds', timezone: 'Europe/Vienna',
        ownerDisplayName: 'Owner', ownerImageUrl: '', playlistRevision: 0, maxMembers: 5, isDemo: false,
        createdAt: '2026-09-01T00:00:00Z'
      },
      members: [{leagueId: 'league', userId: 'member', role: 'member', displayName: 'Member', imageUrl: '', joinedAt: 'now'}],
      standings: [], recommendations: [], playlists: [], breakdownByRecommender: new Map()
    });
    songLeague.subscribeToLeague.and.returnValue(jasmine.createSpy('unsubscribe'));
    songLeague.isFridayInTimezone.and.returnValue(false);
    songLeague.ensureMemberReadyForLeague.and.resolveTo({
      refreshed: false, snapshotDate: '2026-09-04'
    });
    songLeague.submitRecommendation.and.resolveTo('recommendation');
    songLeague.syncWeeklyPlaylists.and.resolveTo();
    songLeague.setMemberLimit.and.resolveTo(12);

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

  it('repairs member sync and refreshes stale stats while the league is loading', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const songLeague = TestBed.inject(SongLeagueService) as jasmine.SpyObj<SongLeagueService>;
    expect(songLeague.ensureMemberReadyForLeague).toHaveBeenCalledOnceWith(
      'league', 'Europe/Vienna'
    );
  });

  it('rechecks today\'s stats immediately before locking a recommendation', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const songLeague = TestBed.inject(SongLeagueService) as jasmine.SpyObj<SongLeagueService>;
    songLeague.ensureMemberReadyForLeague.calls.reset();
    const callOrder: string[] = [];
    songLeague.ensureMemberReadyForLeague.and.callFake(async () => {
      callOrder.push('refresh');
      return {refreshed: false, snapshotDate: '2026-09-04'};
    });
    songLeague.submitRecommendation.and.callFake(async () => {
      callOrder.push('submit');
      return 'recommendation';
    });
    component.selectedTrack = {
      id: 'track', name: 'Fresh pick', artists: [{id: 'artist', name: 'Artist'}],
      album: {id: 'album', name: 'Album', images: []}
    };

    await component.submitRecommendation();

    expect(songLeague.ensureMemberReadyForLeague).toHaveBeenCalledOnceWith(
      'league', 'Europe/Vienna'
    );
    expect(callOrder).toEqual(['refresh', 'submit']);
  });

  it('lets only the owner save a capacity at or above the current roster', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const songLeague = TestBed.inject(SongLeagueService) as jasmine.SpyObj<SongLeagueService>;
    component.currentUserId = 'owner';
    component.memberLimit = 12;

    await component.saveMemberLimit();

    expect(songLeague.setMemberLimit).toHaveBeenCalledOnceWith('league', 12);
    expect(component.dashboard?.league.maxMembers).toBe(12);
  });

  it('keeps league B and its subscription when league A resolves later', async () => {
    const paramMap = new Subject<any>();
    const pending = new Map<string, (dashboard: any) => void>();
    const songLeague = TestBed.inject(SongLeagueService) as jasmine.SpyObj<SongLeagueService>;
    songLeague.loadDashboard.and.callFake((id: string) => new Promise(resolve => pending.set(id, resolve)));
    songLeague.subscribeToLeague.calls.reset();
    const routed = new SongLeagueDetailComponent(
      {paramMap, snapshot: {paramMap: {get: () => ''}}} as any,
      TestBed.inject(Router), songLeague, notifications
    );
    void routed.ngOnInit();
    paramMap.next({get: () => 'league-a'});
    paramMap.next({get: () => 'league-b'});

    pending.get('league-b')?.(dashboard('league-b'));
    await flushAsyncWork();
    pending.get('league-a')?.(dashboard('league-a'));
    await flushAsyncWork();

    expect(routed.dashboard?.league.id).toBe('league-b');
    expect(songLeague.subscribeToLeague).toHaveBeenCalledOnceWith('league-b', jasmine.any(Function));
    routed.ngOnDestroy();
  });

  function dashboard(id: string): any {
    return {
      league: {id, ownerUserId: 'owner', name: id, timezone: 'Europe/Vienna', ownerDisplayName: 'Owner',
        ownerImageUrl: '', playlistRevision: 0, maxMembers: 5, isDemo: true, createdAt: 'now'},
      members: [], standings: [], recommendations: [], playlists: [], breakdownByRecommender: new Map()
    };
  }

  async function flushAsyncWork(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
});
