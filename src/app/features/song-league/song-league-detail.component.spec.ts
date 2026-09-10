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
            setMemberLimit: vi.fn().mockName("SongLeagueService.setMemberLimit"),
            createInvite: vi.fn().mockName("SongLeagueService.createInvite"),
            listActiveInvites: vi.fn().mockName("SongLeagueService.listActiveInvites"),
            revokeInvite: vi.fn().mockName("SongLeagueService.revokeInvite"),
            revokeAllInvites: vi.fn().mockName("SongLeagueService.revokeAllInvites"),
            listLifecycleEvents: vi.fn().mockName("SongLeagueService.listLifecycleEvents"),
            leaveLeague: vi.fn().mockName("SongLeagueService.leaveLeague"),
            closeLeague: vi.fn().mockName("SongLeagueService.closeLeague"),
            removeMember: vi.fn().mockName("SongLeagueService.removeMember"),
            transferOwnership: vi.fn().mockName("SongLeagueService.transferOwnership"),
            listRejoinRequests: vi.fn().mockName("SongLeagueService.listRejoinRequests"),
            respondToRejoinRequest: vi.fn().mockName("SongLeagueService.respondToRejoinRequest")
        };
        songLeague.currentUserId.mockResolvedValue('member');
        songLeague.loadDashboard.mockResolvedValue({
            league: {
                id: 'league', ownerUserId: 'owner', name: 'Friday Finds', timezone: 'Europe/Vienna',
                ownerDisplayName: 'Owner', ownerImageUrl: '', playlistRevision: 0, maxMembers: 5, isDemo: false,
                createdAt: '2026-09-01T00:00:00Z'
            },
            members: [{ leagueId: 'league', userId: 'member', role: 'member', displayName: 'Member', imageUrl: '', joinedAt: '2026-09-01T00:00:00Z' }],
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
        songLeague.createInvite.mockResolvedValue({id: 'invite', url: 'https://example.com/join/secret'});
        songLeague.listActiveInvites.mockResolvedValue([]);
        songLeague.revokeInvite.mockResolvedValue(undefined);
        songLeague.revokeAllInvites.mockResolvedValue(2);
        songLeague.listLifecycleEvents.mockResolvedValue([]);
        songLeague.leaveLeague.mockResolvedValue(undefined);
        songLeague.closeLeague.mockResolvedValue(undefined);
        songLeague.removeMember.mockResolvedValue(undefined);
        songLeague.transferOwnership.mockResolvedValue(undefined);
        songLeague.listRejoinRequests.mockResolvedValue([]);
        songLeague.respondToRejoinRequest.mockResolvedValue(undefined);

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

    it('coalesces realtime roster and league lifecycle bursts into one dashboard refresh', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        const songLeague = TestBed.inject(SongLeagueService) as any;
        const onChange = songLeague.subscribeToLeague.mock.calls[0][1];
        songLeague.loadDashboard.mockClear();

        onChange();
        onChange();
        onChange();
        await flushAsyncWork();

        expect(songLeague.loadDashboard).toHaveBeenCalledTimes(1);
        expect(songLeague.loadDashboard).toHaveBeenCalledWith('league');
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

    it('keeps the owner invite action accessible when mobile hides its text label', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        component.currentUserId = 'owner';
        fixture.detectChanges();

        const invite = fixture.nativeElement.querySelector('.invite-button') as HTMLButtonElement;
        expect(invite.getAttribute('aria-label')).toBe('Invite a member');
        expect(invite.querySelector('span')?.textContent).toBe('Invite');
        expect(invite.querySelector('.pi-user-plus')).toBeTruthy();
    });

    it('loads token-free active invitations for the owner and can revoke one or all', async () => {
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.currentUserId.mockResolvedValue('owner');
        songLeague.listActiveInvites.mockResolvedValue([{
            id: 'invite-a', createdAt: '2026-09-01T10:00:00Z', expiresAt: '2026-09-08T10:00:00Z',
            usagePolicy: 'multi_use', useCount: 2, maxUses: null, lastUsedAt: '2026-09-02T10:00:00Z'
        }, {
            id: 'invite-b', createdAt: '2026-09-03T10:00:00Z', expiresAt: '2026-09-10T10:00:00Z',
            usagePolicy: 'one_time', useCount: 0, maxUses: 1, lastUsedAt: null
        }]);

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const manager = fixture.nativeElement.querySelector('.league-invite-manager') as HTMLElement;
        expect(songLeague.listActiveInvites).toHaveBeenCalledWith('league');
        expect(manager.textContent).toContain('Active invitations');
        expect(manager.textContent).not.toContain('https://example.com/join/secret');

        await component.revokeInvite('invite-a');
        expect(songLeague.revokeInvite).toHaveBeenCalledWith('invite-a');
        expect(component.activeInvites.map(invite => invite.id)).toEqual(['invite-b']);

        await component.revokeAllInvites();
        expect(songLeague.revokeAllInvites).toHaveBeenCalledWith('league');
        expect(component.activeInvites).toEqual([]);
    });

    it('confirms member departure only after explaining its retained history and stopped automation', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        component.openLifecycleModal('leave');
        fixture.detectChanges();
        const dialog = fixture.nativeElement.querySelector('[aria-labelledby="league-lifecycle-title"]') as HTMLElement;
        expect(dialog.textContent).toContain('existing points and songs stay');
        expect(dialog.textContent).toContain('playlist updates, and notifications stop');

        await component.confirmLifecycleAction();
        const songLeague = TestBed.inject(SongLeagueService) as any;
        expect(songLeague.leaveLeague).toHaveBeenCalledWith('league');
        expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/song-league']);
    });

    it('lets owners remove members, transfer ownership, and close into read-only history', async () => {
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.currentUserId.mockResolvedValue('owner');
        songLeague.loadDashboard.mockResolvedValue({
            ...dashboard('league'),
            league: {...dashboard('league').league, isDemo: false},
            members: [
                {leagueId: 'league', userId: 'owner', role: 'owner', displayName: 'Owner', imageUrl: '', joinedAt: '2026-09-01T00:00:00Z'},
                {leagueId: 'league', userId: 'member', role: 'member', displayName: 'Member', imageUrl: '', joinedAt: '2026-09-01T00:00:00Z'}
            ]
        });
        fixture.detectChanges();
        await fixture.whenStable();
        const member = component.dashboard!.members[1];

        component.openLifecycleModal('remove', member);
        await component.confirmLifecycleAction();
        expect(songLeague.removeMember).toHaveBeenCalledWith('league', 'member');

        component.openLifecycleModal('transfer', member);
        await component.confirmLifecycleAction();
        expect(songLeague.transferOwnership).toHaveBeenCalledWith('league', 'member');

        component.currentUserId = 'owner';
        component.dashboard!.league.ownerUserId = 'owner';
        component.openLifecycleModal('close');
        await component.confirmLifecycleAction();
        expect(songLeague.closeLeague).toHaveBeenCalledWith('league');
    });

    it('shows owners pending rejoin requests with approve and decline actions', async () => {
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.currentUserId.mockResolvedValue('owner');
        songLeague.loadDashboard.mockResolvedValue({
            ...dashboard('league'),
            league: {...dashboard('league').league, isDemo: false},
            members: [{leagueId: 'league', userId: 'owner', role: 'owner', displayName: 'Owner', imageUrl: '', joinedAt: '2026-09-01T00:00:00Z'}]
        });
        const request = {
            id: 'request', leagueId: 'league', leagueName: 'Friday Finds', userId: 'departed',
            displayName: 'Departed member', imageUrl: '', status: 'pending' as const, requestedAt: '2026-09-10T08:00:00Z',
            requestExpiresAt: '2026-09-17T08:00:00Z', respondedAt: null, approvalExpiresAt: null
        };
        songLeague.listRejoinRequests.mockResolvedValue([request]);

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const manager = fixture.nativeElement.querySelector('.league-rejoin-manager') as HTMLElement;
        expect(manager.textContent).toContain('Departed member');
        expect(manager.textContent).toContain('Approve');
        await component.respondToRejoin(request, 'approved');
        expect(songLeague.respondToRejoinRequest).toHaveBeenCalledWith('request', 'approved');
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
                ownerImageUrl: '', playlistRevision: 0, maxMembers: 5, isDemo: true, createdAt: '2026-09-01T00:00:00Z' },
            members: [], standings: [], recommendations: [], playlists: [], breakdownByRecommender: new Map()
        };
    }

    async function flushAsyncWork(): Promise<void> {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
});
