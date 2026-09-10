import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { SharedModule } from '@shared/shared.module';

import { PushNotificationService } from '@core/notifications/push-notification.service';
import { SongLeagueService } from '@core/song-league/song-league.service';
import { SongLeagueClaimComponent } from './song-league-claim.component';

describe('SongLeagueClaimComponent notification prompt', () => {
    let fixture: ComponentFixture<SongLeagueClaimComponent>;
    let component: SongLeagueClaimComponent;
    let notifications: any;
    let router: Router;

    beforeEach(() => {
        const songLeague = {
            claimLeague: vi.fn().mockName("SongLeagueService.claimLeague"),
            getMyRejoinRequest: vi.fn().mockName("SongLeagueService.getMyRejoinRequest"),
            requestRejoin: vi.fn().mockName("SongLeagueService.requestRejoin")
        };
        songLeague.claimLeague.mockResolvedValue('league-1');
        songLeague.getMyRejoinRequest.mockResolvedValue(null);
        songLeague.requestRejoin.mockResolvedValue(rejoinRequest('pending'));
        notifications = {
            loadSettings: vi.fn().mockName("PushNotificationService.loadSettings"),
            setSongLeagueEnabled: vi.fn().mockName("PushNotificationService.setSongLeagueEnabled")
        };
        notifications.loadSettings.mockResolvedValue({
            supported: true, installedPwa: true, permission: 'default',
            deviceSubscribed: false, songLeagueEnabled: false, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: false, songAddedActive: false, statsAccessActive: false
        });
        notifications.setSongLeagueEnabled.mockResolvedValue({
            supported: true, installedPwa: true, permission: 'granted',
            deviceSubscribed: true, songLeagueEnabled: true, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: true, songAddedActive: false, statsAccessActive: true
        });
        TestBed.configureTestingModule({
            imports: [SharedModule, RouterTestingModule],
            declarations: [SongLeagueClaimComponent],
            providers: [
                { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'invite-token' } } } },
                { provide: SongLeagueService, useValue: songLeague },
                { provide: PushNotificationService, useValue: notifications }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        router = TestBed.inject(Router);
        vi.spyOn(router, 'navigate').mockResolvedValue(true);
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
        expect(component.joinState).toBe('joined');
        expect(fixture.nativeElement.querySelector('.league-claim-card').textContent).toContain('League joined');
        expect(fixture.nativeElement.querySelector('.league-claim-card').textContent).not.toContain('Could not join league');
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('opens the joined league without prompting when notifications are unavailable', async () => {
        notifications.loadSettings.mockResolvedValue({
            supported: false, installedPwa: false, permission: 'unavailable',
            deviceSubscribed: false, songLeagueEnabled: false, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: false, songAddedActive: false, statsAccessActive: false
        });

        fixture.detectChanges();
        await fixture.whenStable();

        expect(component.joinState).toBe('joined');
        expect(fixture.nativeElement.querySelector('.league-notification-prompt')).toBeNull();
        expect(router.navigate).toHaveBeenCalledWith(['/song-league', 'league-1'], { replaceUrl: true });
    });

    it('opens the joined league without prompting when browser permission is denied', async () => {
        notifications.loadSettings.mockResolvedValue({
            supported: true, installedPwa: true, permission: 'denied',
            deviceSubscribed: false, songLeagueEnabled: false, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: false, songAddedActive: false, statsAccessActive: false
        });

        fixture.detectChanges();
        await fixture.whenStable();

        expect(component.joinState).toBe('joined');
        expect(fixture.nativeElement.querySelector('.league-notification-prompt')).toBeNull();
        expect(notifications.setSongLeagueEnabled).not.toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/song-league', 'league-1'], { replaceUrl: true });
    });

    it('enables notifications from the explicit prompt action and opens the league', async () => {
        fixture.detectChanges();
        await fixture.whenStable();

        await component.enableNotifications();

        expect(notifications.setSongLeagueEnabled).toHaveBeenCalledTimes(1);

        expect(notifications.setSongLeagueEnabled).toHaveBeenCalledWith(true);
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(router.navigate).toHaveBeenCalledWith(['/song-league', 'league-1'], { replaceUrl: true });
    });

    it('lets the member continue without enabling notifications', async () => {
        fixture.detectChanges();
        await fixture.whenStable();

        component.skipNotifications();
        await fixture.whenStable();

        expect(notifications.setSongLeagueEnabled).not.toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(router.navigate).toHaveBeenCalledWith(['/song-league', 'league-1'], { replaceUrl: true });
    });

    it('skips the prompt when notifications are already active', async () => {
        notifications.loadSettings.mockResolvedValue({
            supported: true, installedPwa: true, permission: 'granted',
            deviceSubscribed: true, songLeagueEnabled: true, songLeagueSongAddedEnabled: false,
            songLeagueMember: true, statsAccessRequestsEnabled: true,
            active: true, songAddedActive: false, statsAccessActive: true
        });

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.league-notification-prompt')).toBeNull();
        expect(component.joinState).toBe('joined');
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(router.navigate).toHaveBeenCalledWith(['/song-league', 'league-1'], { replaceUrl: true });
    });

    it('offers a deliberate rejoin request after the server identifies a departed member', async () => {
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.claimLeague.mockRejectedValue(new Error('The league owner must approve this user before they can rejoin.'));

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.canRequestRejoin).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('Request to rejoin');

        await component.requestRejoin();
        expect(songLeague.requestRejoin).toHaveBeenCalledWith('invite-token');
        expect(component.rejoinRequest?.status).toBe('pending');
        expect(component.canRequestRejoin).toBe(false);
    });

    it('shows pending and approved expiry, and retries the same invite only after approval', async () => {
        const songLeague = TestBed.inject(SongLeagueService) as any;
        songLeague.claimLeague.mockRejectedValueOnce(new Error('The league owner must approve this user before they can rejoin.'));
        songLeague.getMyRejoinRequest.mockResolvedValue(rejoinRequest('approved'));

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain('Rejoin before');
        songLeague.claimLeague.mockResolvedValueOnce('league-1');
        await component.retryJoin();
        expect(songLeague.claimLeague).toHaveBeenCalledTimes(2);
    });

    function rejoinRequest(status: 'pending' | 'approved' | 'declined' | 'expired'): any {
        return {
            id: 'request-1', leagueId: 'league-1', leagueName: 'Friday Finds', userId: 'member',
            displayName: 'Member', imageUrl: '', status, requestedAt: '2026-09-10T08:00:00Z',
            requestExpiresAt: '2026-09-17T08:00:00Z', respondedAt: status === 'pending' ? null : '2026-09-10T09:00:00Z',
            approvalExpiresAt: status === 'approved' ? '2026-09-11T09:00:00Z' : null
        };
    }
});
