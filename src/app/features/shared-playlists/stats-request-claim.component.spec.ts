import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { StatsSharingService } from '@core/sharing/stats-sharing.service';
import { StatsRequestClaimComponent } from './stats-request-claim.component';

describe('StatsRequestClaimComponent', () => {
    let fixture: ComponentFixture<StatsRequestClaimComponent>;
    let component: StatsRequestClaimComponent;
    let statsSharing: any;
    let router: any;

    beforeEach(() => {
        statsSharing = {
            claimAccessInvite: vi.fn().mockName("StatsSharingService.claimAccessInvite")
        };
        router = {
            navigate: vi.fn().mockName("Router.navigate")
        };
        statsSharing.claimAccessInvite.mockResolvedValue('request-id');
        router.navigate.mockResolvedValue(true);

        TestBed.configureTestingModule({
            declarations: [StatsRequestClaimComponent],
            imports: [CommonModule],
            providers: [
                { provide: StatsSharingService, useValue: statsSharing },
                { provide: Router, useValue: router },
                { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'private-token' } } } }
            ]
        });
        fixture = TestBed.createComponent(StatsRequestClaimComponent);
        component = fixture.componentInstance;
    });

    it('claims the link and routes to the existing accept-or-decline popup', async () => {
        await component.ngOnInit();

        expect(statsSharing.claimAccessInvite).toHaveBeenCalledTimes(1);

        expect(statsSharing.claimAccessInvite).toHaveBeenCalledWith('private-token');
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(router.navigate).toHaveBeenCalledWith(['/shared-playlists'], { replaceUrl: true });
    });

    it('keeps an invalid link on a helpful error screen', async () => {
        statsSharing.claimAccessInvite.mockRejectedValue(new Error('This stats request link has expired.'));

        await component.ngOnInit();
        fixture.detectChanges();

        expect(component.isOpening).toBe(false);
        expect(fixture.nativeElement.textContent).toContain('This stats request link has expired.');
        expect(router.navigate).not.toHaveBeenCalled();
    });
});
