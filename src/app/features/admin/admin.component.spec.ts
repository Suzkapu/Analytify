import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {NO_ERRORS_SCHEMA} from '@angular/core';

import {AdminService} from '@core/admin/admin.service';
import {AdminComponent} from './admin.component';

describe('AdminComponent', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let adminService: jasmine.SpyObj<AdminService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    adminService = jasmine.createSpyObj<AdminService>('AdminService', [
      'loadSiteSettings',
      'listUsers',
      'listRuns',
      'updateSiteSettings',
      'updateUser',
      'enqueueUser',
      'createDemoLeague',
      'sendTestNotification'
    ]);

    adminService.loadSiteSettings.and.resolveTo({announcement: '', allowSongLeagueCreation: true});
    adminService.listUsers.and.resolveTo([]);
    adminService.listRuns.and.resolveTo([
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

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [AdminComponent],
      providers: [
        {provide: AdminService, useValue: adminService},
        {provide: Router, useValue: router}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
  });

  it('keeps Recent runs (Audit trail) collapsed by default', async () => {
    expect(component.isRunsCollapsed).toBeTrue();

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isRunsCollapsed).toBeTrue();
    const runsContent = fixture.nativeElement.querySelector('#admin-runs-content');
    expect(runsContent).toBeNull();

    const runsPanel = fixture.nativeElement.querySelector('.runs-panel');
    expect(runsPanel).not.toBeNull();
    expect(runsPanel.classList).toContain('collapsed');
  });

  it('expands and collapses Recent runs when toggled', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.toggleRunsCollapsed();
    fixture.detectChanges();

    expect(component.isRunsCollapsed).toBeFalse();
    let runsContent = fixture.nativeElement.querySelector('#admin-runs-content');
    expect(runsContent).not.toBeNull();
    expect(runsContent.textContent).toContain('Listening history');

    component.toggleRunsCollapsed();
    fixture.detectChanges();

    expect(component.isRunsCollapsed).toBeTrue();
    runsContent = fixture.nativeElement.querySelector('#admin-runs-content');
    expect(runsContent).toBeNull();
  });

  it('keeps user schedule cards collapsed by default and extends them on toggle', async () => {
    adminService.listUsers.and.resolveTo([
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

    expect(component.isUserExpanded('user-1')).toBeFalse();
    let settings = fixture.nativeElement.querySelector('.user-card-settings');
    expect(settings).toBeNull();

    const userCard = fixture.nativeElement.querySelector('.admin-user-card');
    expect(userCard.textContent).toContain('Alice');
    expect(userCard.textContent).toContain('spotify-user-1');
    expect(userCard.textContent).toContain('3 tasks enabled');

    component.toggleUserExpanded('user-1');
    fixture.detectChanges();

    expect(component.isUserExpanded('user-1')).toBeTrue();
    settings = fixture.nativeElement.querySelector('.user-card-settings');
    expect(settings).not.toBeNull();
    expect(settings.textContent).toContain('Timezone');
    expect(settings.textContent).toContain('Listening history');
    expect(settings.textContent).toContain('Short-term stats');

    component.toggleUserExpanded('user-1');
    fixture.detectChanges();

    expect(component.isUserExpanded('user-1')).toBeFalse();
    settings = fixture.nativeElement.querySelector('.user-card-settings');
    expect(settings).toBeNull();
  });
});
