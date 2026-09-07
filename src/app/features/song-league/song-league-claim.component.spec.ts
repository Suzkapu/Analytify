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
            claimLeague: vi.fn().mockName("SongLeagueService.claimLeague")
        };
        songLeague.claimLeague.mockResolvedValue('league-1');
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
        expect(router.navigate).not.toHaveBeenCalled();
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
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(router.navigate).toHaveBeenCalledWith(['/song-league', 'league-1'], { replaceUrl: true });
    });
});
