import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {AdminService} from '@core/admin/admin.service';
import {AdminComponent} from './admin.component';
import {AdminPolicyEditorComponent} from './admin-policy-editor.component';
import {AdminRunRecordComponent} from './admin-run-record.component';
import {AdminRunFeedbackComponent} from './admin-run-feedback.component';
import {AdminUserCardComponent} from './admin-user-card.component';
import {AdminPendingReviewDialogComponent} from './admin-pending-review-dialog.component';

async function mountAdmin(healthFails: boolean) {
  const retained = {
    site: {announcement: 'Scheduled maintenance', allowSongLeagueCreation: false},
    policies: [{taskKey: 'listening_history', available: true, intervalValue: 60, intervalUnit: 'minutes'}],
    users: [{userId: 'user-1', spotifyId: 'synthetic-spotify', displayName: 'Synthetic administrator fixture', profilePicUrl: '',
      backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'Europe/Vienna',
      historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
      shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
      mediumTermEnabled: false, mediumTermIntervalHours: 24, mediumTermIntervalUnit: 'hours',
      longTermEnabled: false, longTermIntervalHours: 24, longTermIntervalUnit: 'hours',
      songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true, songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
      sharedPlaylistsEnabled: false, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes', lastSuccessAt: null, lastError: null}],
    runs: [{id: 'run-1', displayName: 'Synthetic user', taskKey: 'listening_history', status: 'failed', triggerType: 'scheduled', requestedAt: '2026-10-24T08:00:00Z', startedAt: null, finishedAt: null, error: 'Synthetic retry', details: {}}],
    reports: [{reportId: 'report-1', receiptCode: 'TEST-RECEIPT', category: 'user_safety', status: 'appealed', reporterName: 'Synthetic reporter', affectedName: 'Synthetic recipient', reason: 'Review requested', appealReason: 'Please review', createdAt: '2026-10-24T08:00:00Z'}]
  };
  const service = {
    loadSiteSettings: vi.fn().mockResolvedValue(retained.site),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue(retained.policies),
    listUsers: vi.fn().mockResolvedValue(retained.users),
    listRuns: vi.fn().mockResolvedValue(retained.runs),
    listModerationReports: vi.fn().mockResolvedValue(retained.reports),
    loadOperationalHealth: healthFails
      ? vi.fn().mockRejectedValue(new Error('Excluded runtime service is unavailable'))
      : vi.fn().mockResolvedValue({releases: {}, alerts: []})
  };
  await TestBed.configureTestingModule({
    declarations: [AdminComponent], imports: [AdminPendingReviewDialogComponent, CommonModule, FormsModule, AdminPolicyEditorComponent, AdminRunRecordComponent, AdminRunFeedbackComponent, AdminUserCardComponent],
    providers: [{provide: AdminService, useValue: service}, {provide: Router, useValue: {navigate: vi.fn()}}]
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {fixture, component: fixture.componentInstance, service, retained};
}

describe('retained administration boundaries', () => {
  it('loads retained settings, policies, users, audit runs and moderation without the excluded health backend', async () => {
    const {component, service, retained} = await mountAdmin(true);
    expect(component.errorMessage).toBe('');
    expect(component.isLoading).toBe(false);
    expect(component.siteSettings).toEqual(retained.site);
    expect(component.schedulePolicies).toEqual(retained.policies);
    expect(component.users).toEqual(retained.users);
    expect(component.runs).toEqual(retained.runs);
    expect(component.moderationReports).toEqual(retained.reports);
    expect(service.loadOperationalHealth).not.toHaveBeenCalled();
    for (const name of ['loadSiteSettings', 'loadSyncSchedulePolicy', 'listUsers', 'listRuns', 'listModerationReports'] as const) {
      expect(service[name]).toHaveBeenCalledExactlyOnceWith();
    }
  });

  it('renders retained administration controls without a runtime-health panel', async () => {
    const {fixture} = await mountAdmin(false);
    const page = fixture.nativeElement as HTMLElement;
    const headings = [...page.querySelectorAll('h2')].map(heading => heading.textContent?.trim());
    expect(headings).toContain('Site settings');
    expect(page.textContent).toContain('TEST-RECEIPT');
    expect(page.textContent).toContain('Please review');
    expect(page.querySelector('.runs-panel')).not.toBeNull();
    expect(headings).not.toContain('Runtime health');
    expect(page.textContent).not.toContain('Worker never observed');
    expect(page.querySelector('.operations-panel')).toBeNull();
  });

  it('keeps retained-service failures visible, preserves cached rows and recovers on refresh', async () => {
    const {fixture, component, service, retained} = await mountAdmin(false);
    service.listRuns.mockRejectedValueOnce(new Error('Audit trail temporarily unavailable'));
    await component.load();
    fixture.detectChanges();
    expect(component.isLoading).toBe(false);
    expect(component.errorMessage).toBe('Audit trail temporarily unavailable');
    expect(component.runs).toEqual(retained.runs);
    expect(component.users).toEqual(retained.users);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Audit trail temporarily unavailable');
    await component.load();
    fixture.detectChanges();
    expect(component.errorMessage).toBe('');
    expect(component.runs).toEqual(retained.runs);
    expect(component.schedulePolicies).toEqual(retained.policies);
    expect(component.moderationReports).toEqual(retained.reports);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

});
