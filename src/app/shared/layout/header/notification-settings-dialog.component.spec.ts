import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PushNotificationService, PushNotificationSettings} from '@core/notifications/push-notification.service';
import {NotificationSettingsDialogComponent} from './notification-settings-dialog.component';

describe('NotificationSettingsDialogComponent', () => {
  let fixture: ComponentFixture<NotificationSettingsDialogComponent>;
  let service: any;

  const settings = (overrides: Partial<PushNotificationSettings> = {}): PushNotificationSettings => ({
    supported: true, installedPwa: true, permission: 'granted', deviceSubscribed: true,
    deviceRegistered: true, registeredDeviceCount: 1, deviceState: 'registered',
    songLeagueEnabled: true, songLeagueSongAddedEnabled: false, songLeagueMember: true,
    statsAccessRequestsEnabled: true, active: true, songAddedActive: false, statsAccessActive: true,
    ...overrides
  });

  beforeEach(async () => {
    service = {
      loadSettings: vi.fn().mockResolvedValue(settings()),
      setSongLeagueEnabled: vi.fn().mockImplementation((enabled: boolean) => Promise.resolve(settings({songLeagueEnabled: enabled, active: enabled}))),
      setSongLeagueSongAddedEnabled: vi.fn().mockImplementation((enabled: boolean) => Promise.resolve(settings({songLeagueSongAddedEnabled: enabled, songAddedActive: enabled}))),
      setStatsAccessRequestsEnabled: vi.fn().mockImplementation((enabled: boolean) => Promise.resolve(settings({statsAccessRequestsEnabled: enabled, statsAccessActive: enabled})))
    };
    await TestBed.configureTestingModule({
      imports: [NotificationSettingsDialogComponent],
      providers: [{provide: PushNotificationService, useValue: service}]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationSettingsDialogComponent);
  });

  it.each([
    ['registered', 'This device is ready'], ['permission-required', 'Permission required'],
    ['denied', 'Notifications are blocked'], ['unsupported', 'Notifications are unavailable'],
    ['subscription-missing', 'Finish device setup'], ['server-only', 'Set up this device']
  ] as const)('renders the %s device state as a user outcome', async (deviceState, title) => {
    service.loadSettings.mockResolvedValue(settings({deviceState}));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-device-block')?.textContent).toContain(title);
    const icons = fixture.nativeElement.querySelectorAll('.pi') as NodeListOf<HTMLElement>;
    expect(icons.length).toBeGreaterThan(0);
    expect([...icons].every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('keeps install guidance in the device block instead of category rows', async () => {
    service.loadSettings.mockResolvedValue(settings({installedPwa: false}));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-device-block')?.textContent).toContain('Install Analytify');
    expect(fixture.nativeElement.querySelector('.notification-category-list')?.textContent).not.toContain('Install Analytify');
  });

  it('updates all categories and announces a successful save', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.componentInstance.toggleSongLeague({target: {checked: false}} as any);
    await fixture.componentInstance.toggleSongAdded({target: {checked: true}} as any);
    await fixture.componentInstance.toggleStatsAccess({target: {checked: false}} as any);
    fixture.detectChanges();
    expect(service.setSongLeagueEnabled).toHaveBeenCalledWith(false);
    expect(service.setSongLeagueSongAddedEnabled).toHaveBeenCalledWith(true);
    expect(service.setStatsAccessRequestsEnabled).toHaveBeenCalledWith(false);
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('saved');
  });

  it('shows errors without requesting permission during initial loading', async () => {
    service.loadSettings.mockRejectedValueOnce(new Error('Could not load preferences'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Could not load preferences');
    expect(service.setSongLeagueEnabled).not.toHaveBeenCalled();
  });
});
