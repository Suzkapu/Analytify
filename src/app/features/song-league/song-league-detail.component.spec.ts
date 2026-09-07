import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { Subject } from 'rxjs';

import { PushNotificationService } from '@core/notifications/push-notification.service';
import { SongLeagueService } from '@core/song-league/song-league.service';
import { SongLeagueDetailComponent } from './song-league-detail.component';

describe('SongLeagueDetailComponent notifications', () => {
    let fixture: ComponentFixture<SongLeagueDetailComponent>;
    let component: SongLeagueDetailComponent;
    let notifications: any;

    beforeEach(() => {
        notifications = {
            loadSettings: vi.fn().mockName("PushNotificationService.loadSettings"),
            setSongLeagueEnabled: vi.fn().mockName("PushNotificationService.setSongLeagueEnabled")
        };
        notifications.loadSettings.mockResolvedValue({
            supported: true, installedPwa: true, permission: 'granted',
            deviceSubscribed: true, songLeagueEnabled: true, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: true, songAddedActive: false, statsAccessActive: true
        });
        notifications.setSongLeagueEnabled.mockResolvedValue({
            supported: true, installedPwa: true, permission: 'granted',
            deviceSubscribed: true, songLeagueEnabled: false, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: false, songAddedActive: false, statsAccessActive: true
        });
        const songLeague = {
            currentUserId: vi.fn().mockName("SongLeagueService.currentUserId"),
            loadDashboard: vi.fn().mockName("SongLeagueService.loadDashboard"),
            ensureMemberReadyForLeague: vi.fn().mockName("SongLeagueService.ensureMemberReadyForLeague"),
            subscribeToLeague: vi.fn().mockName("SongLeagueService.subscribeToLeague"),
            isFridayInTimezone: vi.fn().mockName("SongLeagueService.isFridayInTimezone"),
            submitRecommendation: vi.fn().mockName("SongLeagueService.submitRecommendation"),
            syncWeeklyPlaylists: vi.fn().mockName("SongLeagueService.syncWeeklyPlaylists"),
            setMemberLimit: vi.fn().mockName("SongLeagueService.setMemberLimit")
        };
        songLeague.currentUserId.mockResolvedValue('member');
        songLeague.loadDashboard.mockResolvedValue({
            league: {
                id: 'league', ownerUserId: 'owner', name: 'Friday Finds', timezone: 'Europe/Vienna',
                ownerDisplayName: 'Owner', ownerImageUrl: '', playlistRevision: 0, maxMembers: 5, isDemo: false,
                createdAt: '2026-09-01T00:00:00Z'
            },
            members: [{ leagueId: 'league', userId: 'member', role: 'member', displayName: 'Member', imageUrl: '', joinedAt: 'now' }],
            standings: [], recommendations: [], playlists: [], breakdownByRecommender: new Map()
        });
        songLeague.subscribeToLeague.mockReturnValue(vi.fn().mockName('unsubscribe'));
        songLeague.isFridayInTimezone.mockReturnValue(false);
        songLeague.ensureMemberReadyForLeague.mockResolvedValue({
            refreshed: false, snapshotDate: '2026-09-04'
        });
        songLeague.submitRecommendation.mockResolvedValue('recommendation');
        songLeague.syncWeeklyPlaylists.mockResolvedValue(undefined);
        songLeague.setMemberLimit.mockResolvedValue(12);

        TestBed.configureTestingModule({
            imports: [SharedModule],
            declarations: [SongLeagueDetailComponent],
            providers: [
                { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'league' } } } },
                { provide: Router, useValue: { navigate: vi.fn().mockName('navigate') } },
                { provide: SongLeagueService, useValue: songLeague },
                { provide: PushNotificationService, useValue: notifications }
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

        expect(notifications.setSongLeagueEnabled).toHaveBeenCalledTimes(1);

        expect(notifications.setSongLeagueEnabled).toHaveBeenCalledWith(false);
        expect(component.notificationSettings.songLeagueEnabled).toBe(false);
    });

    it('repairs member sync and refreshes stale stats while the league is loading', async () => {
        fixture.detectChanges();
        await fixture.whenStable();

        const songLeague = TestBed.inject(SongLeagueService) as any;
        expect(songLeague.ensureMemberReadyForLeague).toHaveBeenCalledTimes(1);
        expect(songLeague.ensureMemberReadyForLeague).toHaveBeenCalledWith('league', 'Europe/Vienna');
    });

    it('rechecks today\'s stats immediately before locking a recommendation', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.ensureMemberReadyForLeague.mockClear();
        const callOrder: string[] = [];
        songLeague.ensureMemberReadyForLeague.mockImplementation(async () => {
            callOrder.push('refresh');
            return { refreshed: false, snapshotDate: '2026-09-04' };
        });
        songLeague.submitRecommendation.mockImplementation(async () => {
            callOrder.push('submit');
            return 'recommendation';
        });
        component.selectedTrack = {
            id: 'track', name: 'Fresh pick', artists: [{ id: 'artist', name: 'Artist' }],
            album: { id: 'album', name: 'Album', images: [] }
        };

        await component.submitRecommendation();

        expect(songLeague.ensureMemberReadyForLeague).toHaveBeenCalledTimes(1);

        expect(songLeague.ensureMemberReadyForLeague).toHaveBeenCalledWith('league', 'Europe/Vienna');
        expect(callOrder).toEqual(['refresh', 'submit']);
    });

    it('lets only the owner save a capacity at or above the current roster', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        const songLeague = TestBed.inject(SongLeagueService) as any;
        component.currentUserId = 'owner';
        component.memberLimit = 12;

        await component.saveMemberLimit();

        expect(songLeague.setMemberLimit).toHaveBeenCalledTimes(1);

        expect(songLeague.setMemberLimit).toHaveBeenCalledWith('league', 12);
        expect(component.dashboard?.league.maxMembers).toBe(12);
    });

    it('keeps league B and its subscription when league A resolves later', async () => {
        const paramMap = new Subject<any>();
        const pending = new Map<string, (dashboard: any) => void>();
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.loadDashboard.mockImplementation((id: string) => new Promise(resolve => pending.set(id, resolve)));
        songLeague.subscribeToLeague.mockClear();
        const routed = new SongLeagueDetailComponent({ paramMap, snapshot: { paramMap: { get: () => '' } } } as any, TestBed.inject(Router), songLeague, notifications);
        void routed.ngOnInit();
        paramMap.next({ get: () => 'league-a' });
        paramMap.next({ get: () => 'league-b' });

        pending.get('league-b')?.(dashboard('league-b'));
        await flushAsyncWork();
        pending.get('league-a')?.(dashboard('league-a'));
        await flushAsyncWork();

        expect(routed.dashboard?.league.id).toBe('league-b');
        expect(songLeague.subscribeToLeague).toHaveBeenCalledTimes(1);
        expect(songLeague.subscribeToLeague).toHaveBeenCalledWith('league-b', expect.any(Function));
        routed.ngOnDestroy();
    });

    function dashboard(id: string): any {
        return {
            league: { id, ownerUserId: 'owner', name: id, timezone: 'Europe/Vienna', ownerDisplayName: 'Owner',
                ownerImageUrl: '', playlistRevision: 0, maxMembers: 5, isDemo: true, createdAt: 'now' },
            members: [], standings: [], recommendations: [], playlists: [], breakdownByRecommender: new Map()
        };
    }

    async function flushAsyncWork(): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
});
