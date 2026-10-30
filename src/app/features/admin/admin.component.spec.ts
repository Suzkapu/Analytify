import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { AdminService } from '@core/admin/admin.service';
import { AdminComponent } from './admin.component';
import {AdminRunRecordComponent} from './admin-run-record.component';
import {AdminRunFeedbackComponent} from './admin-run-feedback.component';
import {AdminUserSaveFeedbackComponent} from './admin-user-save-feedback.component';
import {AdminUserRefreshActionComponent} from './admin-user-refresh-action.component';
import {AdminUserCardComponent} from './admin-user-card.component';
import {AdminPendingReviewDialogComponent} from './admin-pending-review-dialog.component';
import {AdminPolicyEditorComponent} from './admin-policy-editor.component';

describe('AdminComponent', () => {
    let component: AdminComponent;
    let fixture: ComponentFixture<AdminComponent>;
    let adminService: any;
    let router: any;

    beforeEach(async () => {
        adminService = {
            loadSiteSettings: vi.fn().mockName("AdminService.loadSiteSettings"),
            listUsers: vi.fn().mockName("AdminService.listUsers"),
            listRuns: vi.fn().mockName("AdminService.listRuns"),
            listModerationReports: vi.fn().mockName("AdminService.listModerationReports"),
            loadSyncSchedulePolicy: vi.fn().mockName("AdminService.loadSyncSchedulePolicy"),
            updateSyncSchedulePolicy: vi.fn().mockName("AdminService.updateSyncSchedulePolicy"),
            updateSiteSettings: vi.fn().mockName("AdminService.updateSiteSettings"),
            updateUser: vi.fn().mockName("AdminService.updateUser"),
            reviewPendingProfile: vi.fn().mockName("AdminService.reviewPendingProfile"),
            deleteReviewedPendingProfile: vi.fn().mockName("AdminService.deleteReviewedPendingProfile"),
            enqueueUser: vi.fn().mockName("AdminService.enqueueUser"),
            createDemoLeague: vi.fn().mockName("AdminService.createDemoLeague"),
            sendTestNotification: vi.fn().mockName("AdminService.sendTestNotification"),
            updateModerationReport: vi.fn().mockName("AdminService.updateModerationReport")
        };

        adminService.loadSiteSettings.mockResolvedValue({ announcement: '', allowSongLeagueCreation: true });
        adminService.listUsers.mockResolvedValue([]);
        adminService.listRuns.mockResolvedValue([
            {
                id: 'run-1',
                userId: 'user-1',
                displayName: 'Test User',
                taskKey: 'listening_history',
                status: 'succeeded',
                triggerType: 'scheduled',
                requestedAt: '2026-09-05T08:00:00Z',
                startedAt: '2026-09-05T08:00:01Z',
                finishedAt: '2026-09-05T08:00:05Z',
                error: null,
                details: {}
            }
        ]);
        adminService.loadSyncSchedulePolicy.mockResolvedValue([
            { taskKey: 'listening_history', available: true, intervalValue: 60, intervalUnit: 'minutes' }
        ]);
        adminService.listModerationReports.mockResolvedValue([]);

        router = {
            navigate: vi.fn().mockName("Router.navigate")
        };

        await TestBed.configureTestingModule({
            imports: [AdminPendingReviewDialogComponent, AdminUserCardComponent, AdminRunRecordComponent, AdminRunFeedbackComponent, AdminUserSaveFeedbackComponent, AdminUserRefreshActionComponent, AdminPolicyEditorComponent],
            declarations: [AdminComponent],
            providers: [
                { provide: AdminService, useValue: adminService },
                { provide: Router, useValue: router }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        }).compileComponents();

        fixture = TestBed.createComponent(AdminComponent);
        component = fixture.componentInstance;
    });

    it('keeps Recent runs (Audit trail) collapsed by default', async () => {
        expect(component.isRunsCollapsed).toBe(true);

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.isRunsCollapsed).toBe(true);
        const runsContent = fixture.nativeElement.querySelector('#admin-runs-content');
        expect(runsContent).toBeNull();

        const runsPanel = fixture.nativeElement.querySelector('.runs-panel');
        expect(runsPanel).not.toBeNull();
        expect(runsPanel.classList).toContain('collapsed');
    });

    it('lets administrators set the fastest personal interval and disable listening history', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const policy = component.schedulePolicies[0];
        policy.available = false;
        policy.intervalValue = 2;
        policy.intervalUnit = 'hours';
        await component.saveSchedulePolicy(policy);

        expect(adminService.updateSyncSchedulePolicy).toHaveBeenCalledWith(policy);
        expect(fixture.nativeElement.querySelector('.schedule-policy-panel').textContent).toContain('Schedule limits');
    });

    it('surfaces non-destructive shared-playlist limit warnings from successful runs', async () => {
        const warning = 'Favourite Tracks has more than 5000 songs. Its previous shared version was kept.';
        adminService.listRuns.mockResolvedValue([{
            id: 'warning-run', userId: 'user-1', displayName: 'Synthetic user', taskKey: 'shared_playlists',
            status: 'succeeded', triggerType: 'scheduled', requestedAt: '2026-10-24T08:00:00Z',
            startedAt: null, finishedAt: null, error: null, details: {warnings: [warning]}
        }]);
        fixture.detectChanges();
        await fixture.whenStable();
        component.toggleRunsCollapsed();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('v2-admin-run-record').textContent).toContain(warning);
        expect(fixture.nativeElement.querySelector('v2-admin-run-record .status').textContent).toBe('Succeeded · Warning');
    });

    it('expands and collapses Recent runs when toggled', async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        component.toggleRunsCollapsed();
        fixture.detectChanges();

        expect(component.isRunsCollapsed).toBe(false);
        let runsContent = fixture.nativeElement.querySelector('#admin-runs-content');
        expect(runsContent).not.toBeNull();
        expect(runsContent.textContent).toContain('Listening history');

        component.toggleRunsCollapsed();
        fixture.detectChanges();

        expect(component.isRunsCollapsed).toBe(true);
        runsContent = fixture.nativeElement.querySelector('#admin-runs-content');
        expect(runsContent).toBeNull();
    });

    it('keeps user schedule cards collapsed by default and extends them on toggle', async () => {
        adminService.listUsers.mockResolvedValue([
            {
                userId: 'user-1',
                spotifyId: 'spotify-user-1',
                displayName: 'Alice',
                profilePicUrl: '',
                backupActive: true,
                hasRefreshToken: true,
                enabled: true,
                timezone: 'Europe/Vienna',
                historyEnabled: true,
                historyIntervalMinutes: 60,
                historyIntervalUnit: 'minutes',
                shortTermEnabled: true,
                shortTermIntervalHours: 24,
                shortTermIntervalUnit: 'hours',
                mediumTermEnabled: false,
                mediumTermIntervalHours: 168,
                mediumTermIntervalUnit: 'hours',
                longTermEnabled: false,
                longTermIntervalHours: 168,
                longTermIntervalUnit: 'hours',
                songLeaguePlaylistsEnabled: true,
                songLeaguePlaylistFridaysOnly: true,
                songLeaguePlaylistIntervalMinutes: 60,
                songLeaguePlaylistIntervalUnit: 'minutes',
                sharedPlaylistsEnabled: false,
                sharedPlaylistIntervalMinutes: 60,
                sharedPlaylistIntervalUnit: 'minutes',
                lastSuccessAt: null,
                lastError: null
            }
        ]);

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.isUserExpanded('user-1')).toBe(false);
        let settings = fixture.nativeElement.querySelector('#user-user-1-settings');
        expect(settings).toBeNull();

        const userCard = fixture.nativeElement.querySelector('.admin-user-card');
        expect(userCard.textContent).toContain('Alice');
        expect(userCard.textContent).toContain('spotify-user-1');
        expect(userCard.textContent).toContain('3 optional schedules selected · No required tasks.');

        component.toggleUserExpanded('user-1');
        fixture.detectChanges();

        expect(component.isUserExpanded('user-1')).toBe(true);
        settings = fixture.nativeElement.querySelector('#user-user-1-settings');
        expect(settings).not.toBeNull();
        expect(settings.textContent).toContain('Schedule timezone');
        expect(settings.textContent).toContain('Listening history');
        expect(settings.textContent).toContain('Short-term stats');

        component.toggleUserExpanded('user-1');
        fixture.detectChanges();

        expect(component.isUserExpanded('user-1')).toBe(false);
        settings = fixture.nativeElement.querySelector('#user-user-1-settings');
        expect(settings).toBeNull();
    });

    it('labels pending profiles and deletes them only after a clean review and confirmation', async () => {
        const pending = {
            userId: 'pending-user', spotifyId: 'pending:pending-user', displayName: 'Spotify User', profilePicUrl: '',
            backupActive: false, hasRefreshToken: false, enabled: false, timezone: 'Europe/Vienna',
            historyEnabled: false, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
            shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
            mediumTermEnabled: false, mediumTermIntervalHours: 168, mediumTermIntervalUnit: 'hours',
            longTermEnabled: false, longTermIntervalHours: 168, longTermIntervalUnit: 'hours',
            songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
            songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
            sharedPlaylistsEnabled: false, sharedPlaylistIntervalMinutes: 60,
            sharedPlaylistIntervalUnit: 'minutes', lastSuccessAt: null, lastError: null
        } as any;
        adminService.listUsers.mockResolvedValueOnce([pending]).mockResolvedValueOnce([]);
        adminService.reviewPendingProfile.mockResolvedValue({
            eligible: true, spotifyId: pending.spotifyId, createdAt: '2026-09-01T00:00:00Z', blockers: []
        });

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain('Incomplete registration');

        const action = component.reviewIncompleteProfile(pending);
        await vi.waitFor(() => expect(component.pendingProfileReview?.phase).toBe('eligible'));
        fixture.detectChanges();
        const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog.textContent).toContain('Delete incomplete registration?');
        const actions = [...dialog.querySelectorAll('button')];
        expect(actions.map(button => button.textContent?.trim())).toEqual(['Delete registration', 'Cancel']);
        expect(adminService.deleteReviewedPendingProfile).not.toHaveBeenCalled();
        actions[0].click(); await action;
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
        expect(adminService.deleteReviewedPendingProfile).toHaveBeenCalledWith(pending.userId, pending.spotifyId);
        expect(component.users).toEqual([]);
    });

    it('keeps an incomplete profile when the server review finds linked data', async () => {
        const pending = {userId: 'pending-user', spotifyId: 'pending:pending-user'} as any;
        adminService.reviewPendingProfile.mockResolvedValue({
            eligible: false, spotifyId: pending.spotifyId, createdAt: '', blockers: ['stats_snapshots contains 1 linked record.']
        });
        await component.reviewIncompleteProfile(pending);
        expect(adminService.deleteReviewedPendingProfile).not.toHaveBeenCalled();
        expect(component.errorMessage).toContain('was kept');
    });
});
