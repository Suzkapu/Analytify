import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {DesignV2ShellComponent} from './design-v2-shell.component';
import {AmbientBackgroundComponent} from '@shared/ambient/ambient-background.component';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

@Component({standalone: true, template: '<h1>Playlists</h1>'})
class PlaylistsStubComponent {}

@Component({standalone: true, template: '<h1>Stats</h1>'})
class StatsStubComponent {}

describe('DesignV2ShellComponent', () => {
  async function createShell() {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
    return {harness, shell};
  }

  it('refuses cloud deletion when the cloud identity is unavailable', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue(null);
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.clearDataStep.set('cloud');
    await shell.confirmCloudClear();
    expect(deletion).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(shell.clearDataStep()).toBe('cloud');
    expect(shell.actionError()).toBe('You must be signed in to delete cloud data.');
  });

  it('deletes only the current cloud identity before logout and navigation', async () => {
    const {shell} = await createShell();
    const sequence: string[] = [];
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('current-user');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockImplementation(async () => {sequence.push('delete');});
    vi.spyOn(shell.authService, 'logout').mockImplementation(async () => {sequence.push('logout');});
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(async () => {sequence.push('navigate'); return true;});
    shell.clearDataStep.set('cloud');
    await shell.confirmCloudClear();
    expect(deletion).toHaveBeenCalledExactlyOnceWith('current-user');
    expect(sequence).toEqual(['delete', 'logout', 'navigate']);
    expect(shell.clearDataStep()).toBe('none');
  });

  it('executes anonymous logout only after the explicit confirmation', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(true);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await shell.requestLogout();
    expect(logout).not.toHaveBeenCalled();
    await shell.confirmGuestLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(shell.clearDataStep()).toBe('none');
  });

  it.each([new Error('Backup unavailable'), 'Unknown rejection'])('preserves backup confirmation after enable failure %s', async error => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'enableBackup').mockRejectedValue(error);
    shell.backupConfirmationOpen.set(true);
    await shell.enableBackup();
    expect(shell.backupConfirmationOpen()).toBe(true);
    expect(shell.actionRunning()).toBe(false);
    expect(shell.actionError()).toBe(error instanceof Error ? error.message : 'Cloud Backup could not be enabled.');
    shell.closeConfirmation();
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(shell.actionError()).toBe('');
  });

  it('falls back to the profile icon when artwork fails', async () => {
    const {harness, shell} = await createShell();
    shell.profilePicUrl.set('https://example.com/missing.jpg');
    shell.profileImageFailed();
    harness.fixture.detectChanges();
    expect(shell.profilePicUrl()).toBeNull();
    expect(harness.fixture.nativeElement.querySelector('.v2-account-button .pi-user')).not.toBeNull();
  });

  it('requires anonymous-account confirmation before logging out', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(true);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.toggleAccount();
    await shell.requestLogout();
    expect(shell.accountOpen()).toBe(false);
    expect(shell.clearDataStep()).toBe('guest');
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs out a recoverable account and navigates to login', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.toggleAccount();
    await shell.requestLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(shell.accountOpen()).toBe(false);
    expect(shell.actionRunning()).toBe(false);
    expect(shell.actionError()).toBe('');
  });

  it('does not start a second logout while the first is pending', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    let finish!: () => void;
    const logout = vi.spyOn(shell.authService, 'logout').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const pending = shell.requestLogout();
    await shell.requestLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(shell.actionRunning()).toBe(true);
    finish();
    await pending;
    expect(shell.actionRunning()).toBe(false);
  });

  it.each(['logout', 'navigation', 'cancelled'])('renders an account alert for %s failure', async failure => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'isAnonymousCloudIdentity').mockReturnValue(false);
    const logout = vi.spyOn(shell.authService, 'logout');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    if (failure === 'logout') logout.mockRejectedValue(new Error('Offline'));
    else logout.mockResolvedValue(undefined);
    if (failure === 'navigation') navigate.mockRejectedValue(new Error('Route failed'));
    else navigate.mockResolvedValue(failure !== 'cancelled');
    await expect(shell.requestLogout()).resolves.toBeUndefined();
    harness.fixture.detectChanges();
    expect(shell.accountOpen()).toBe(true);
    expect(shell.actionRunning()).toBe(false);
    expect(harness.fixture.nativeElement.querySelector('.v2-account-dialog [role="alert"]')?.textContent)
      .toContain('Log out did not finish');
    if (failure === 'logout') expect(navigate).not.toHaveBeenCalled();
  });

  it('restores the authoritative backup switch when enabling is cancelled', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'isBackupActive').mockReturnValue(false);
    const input = document.createElement('input');
    input.checked = true;
    shell.requestBackupChange({target: input} as unknown as Event);
    expect(input.checked).toBe(false);
    expect(shell.backupConfirmationOpen()).toBe(true);
    shell.closeConfirmation();
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(input.checked).toBe(false);
  });

  it('announces failed backup disable in the account dialog and releases its busy state', async () => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'isBackupActive').mockReturnValue(true);
    const disable = vi.spyOn(shell.authService, 'disableBackup').mockRejectedValue(new Error('Offline'));
    shell.toggleAccount();
    const input = document.createElement('input');
    input.checked = false;
    shell.requestBackupChange({target: input} as unknown as Event);
    expect(input.checked).toBe(true);
    expect(shell.actionRunning()).toBe(true);
    input.checked = true;
    shell.requestBackupChange({target: input} as unknown as Event);
    expect(disable).toHaveBeenCalledOnce();
    expect(shell.backupConfirmationOpen()).toBe(false);
    await Promise.resolve();
    harness.fixture.detectChanges();
    expect(shell.actionRunning()).toBe(false);
    expect(harness.fixture.nativeElement.querySelector('.v2-account-dialog [role="alert"]')?.textContent)
      .toContain('Cloud Backup could not be disabled');
  });

  it('ignores duplicate enable requests until the first confirmation finishes', async () => {
    const {shell} = await createShell();
    let finish!: () => void;
    const enable = vi.spyOn(shell.authService, 'enableBackup').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    shell.backupConfirmationOpen.set(true);
    const pending = shell.enableBackup();
    await shell.enableBackup();
    expect(enable).toHaveBeenCalledOnce();
    expect(shell.backupConfirmationOpen()).toBe(true);
    finish();
    await pending;
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(shell.actionRunning()).toBe(false);
  });

  it('prevents duplicate deletion and disables Back while an action is pending', async () => {
    const {harness, shell} = await createShell();
    let finish!: () => void;
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    shell.clearDataStep.set('local');
    const pending = shell.confirmLocalClear();
    await shell.confirmLocalClear();
    shell.closeConfirmation();
    harness.fixture.detectChanges();
    expect(shell.clearDataStep()).toBe('local');
    expect(clear).toHaveBeenCalledOnce();
    const back = Array.from(harness.fixture.nativeElement.querySelectorAll('button'))
      .find((node: unknown) => (node as HTMLButtonElement).textContent?.trim() === 'Back') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    finish();
    await pending;
    expect(shell.actionRunning()).toBe(false);
    expect(shell.clearDataStep()).toBe('none');
  });

  it('keeps confirmation and conservative feedback if navigation fails after local clearing', async () => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(false);
    shell.clearDataStep.set('local');
    await shell.confirmLocalClear();
    harness.fixture.detectChanges();
    expect(shell.clearDataStep()).toBe('local');
    expect(shell.actionError()).toContain('Some steps may already have completed');
    expect(harness.fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Some steps may already have completed');
    expect(shell.actionRunning()).toBe(false);
  });

  it('does not log out if cloud deletion fails', async () => {
    const {shell} = await createShell();
    vi.spyOn(shell.authService, 'getSupabaseUserId').mockReturnValue('cloud-user');
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockRejectedValue(new Error('Deletion failed'));
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    shell.clearDataStep.set('cloud');
    await shell.confirmCloudClear();
    expect(deletion).toHaveBeenCalledWith('cloud-user');
    expect(logout).not.toHaveBeenCalled();
    expect(shell.clearDataStep()).toBe('cloud');
    expect(shell.actionError()).toContain('This action did not finish');
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{
        path: '',
        component: DesignV2ShellComponent,
        children: [
          {
            path: 'playlists', component: PlaylistsStubComponent, title: 'Playlists | Analytify',
            data: designV2RouteData('playlists', 'Your Playlists', 'wide', 'library', {preload: true})
          },
          {
            path: 'stats', component: StatsStubComponent, title: 'Stats | Analytify',
            data: designV2RouteData('stats', 'Your Stats', 'full', 'insights', {preload: true})
          },
          {
            path: 'login', component: PlaylistsStubComponent, title: 'Sign in | Analytify',
            data: designV2RouteData('login', 'Sign in', 'form', 'account', {chromeMode: 'focus'})
          }
        ]
      }])]
    });
  });

  it('keeps one shell instance mounted while child routes change', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const first = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance;
    const firstAmbient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance;
    expect(firstAmbient.state.routeKey()).toBe('library');

    await harness.navigateByUrl('/stats');
    const second = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance;
    const secondAmbient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance;

    expect(second).toBe(first);
    expect(secondAmbient).toBe(firstAmbient);
    expect(secondAmbient.state.routeKey()).toBe('insights');
    expect(second.pageContext()).toEqual(expect.objectContaining({
      pageId: 'stats', title: 'Your Stats', width: 'full', ambientKey: 'insights'
    }));
  });

  it('renders desktop and mobile navigation from the same model with semantic active state', async () => {
    const harness = await RouterTestingHarness.create('/stats');
    harness.fixture.detectChanges();
    const element = harness.fixture.nativeElement as HTMLElement;
    const desktop = Array.from(element.querySelectorAll<HTMLElement>('.v2-desktop-nav .v2-nav-link'));
    const mobile = Array.from(element.querySelectorAll<HTMLElement>('.v2-mobile-nav__link'));

    expect(desktop.map(link => link.textContent?.trim())).toEqual(['Playlists', 'Stats', 'History']);
    expect(mobile.map(link => link.textContent?.trim())).toEqual(['Playlists', 'Stats', 'History']);
    expect(desktop.find(link => link.textContent?.includes('Stats'))?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelector('main')?.getAttribute('aria-label')).toBe('Your Stats content');
  });

  it('owns one accessible overlay host and closes the workspace with Escape', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    shell.toggleTools();
    harness.fixture.detectChanges();

    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.v2-overlay-host').length).toBe(1);
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    const ambient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance as AmbientBackgroundComponent;
    expect(ambient.state.overlayState()).toBe('tools');

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    harness.fixture.detectChanges();
    expect(shell.toolsOpen()).toBe(false);
    expect(ambient.state.overlayState()).toBe('none');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the ambient instance through menu navigation and shell-mode changes', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
    const ambient = harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance as AmbientBackgroundComponent;
    shell.toggleTools();
    harness.fixture.detectChanges();
    expect(ambient.state.overlayState()).toBe('tools');

    await harness.navigateByUrl('/stats');
    expect(harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance).toBe(ambient);
    expect(ambient.state.overlayState()).toBe('none');
    await harness.navigateByUrl('/login');
    expect(harness.fixture.debugElement.query(By.directive(AmbientBackgroundComponent)).componentInstance).toBe(ambient);
    expect(ambient.state.shellMode()).toBe('focus');
  });

  it('opens the account hub with a usable profile fallback and all account actions', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    shell.profilePicUrl.set(null);
    shell.toggleAccount();
    harness.fixture.detectChanges();

    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-account-avatar .pi-user')).not.toBeNull();
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Cloud Backup');
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Notifications');
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Manage Spotify access');
    expect(element.querySelector('.v2-account-dialog')?.textContent).toContain('Clear data');
  });

  it('uses minimal chrome for focus routes', async () => {
    const harness = await RouterTestingHarness.create('/login');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-desktop-nav')).toBeNull();
    expect(element.querySelector('.v2-mobile-nav')).toBeNull();
    expect(element.querySelector('.v2-tools-button')).toBeNull();
    expect(element.querySelector('.v2-account-button')).toBeNull();
    expect(element.querySelector('.v2-brand')).not.toBeNull();
  });

  it('uses More consistently and preserves Spotify attribution', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-tools-button')?.textContent?.trim()).toBe('More');
    expect(element.textContent).not.toContain('Workspace');
    expect(element.querySelector('.v2-footer')?.textContent).toContain('Powered by Spotify');
    expect(element.querySelector('.v2-footer')?.textContent).toContain('Legal & privacy');
  });

  it('routes settings through the shared overlay service', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    const open = vi.spyOn(shell.overlays, 'open').mockResolvedValue(null);

    await shell.openNotifications();
    await shell.openAutomaticUpdates();
    await shell.openBlockedUsers();

    expect(open).toHaveBeenCalledTimes(3);
    expect(shell.accountOpen()).toBe(false);
  });

  it('requires confirmation before enabling backup and clearing local data', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    const enable = vi.spyOn(shell.authService, 'enableBackup').mockResolvedValue(undefined);
    const clear = vi.spyOn(shell.authService, 'clearCacheAndLogout').mockResolvedValue(undefined);
    shell.requestBackupChange({target: {checked: true}} as unknown as Event);
    expect(shell.backupConfirmationOpen()).toBe(true);
    expect(enable).not.toHaveBeenCalled();
    await shell.enableBackup();
    expect(enable).toHaveBeenCalledOnce();

    shell.clearDataStep.set('local');
    await shell.confirmLocalClear();
    expect(clear).toHaveBeenCalledOnce();
    expect(shell.clearDataStep()).toBe('none');
  });

  it('provides a skip link and one main landmark', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-skip-link')?.getAttribute('href')).toBe('#v2-main-content');
    expect(element.querySelectorAll('main').length).toBe(1);
  });

  it('applies the route width as the only page-width decision', async () => {
    const harness = await RouterTestingHarness.create('/playlists');
    const main = harness.fixture.nativeElement.querySelector('main') as HTMLElement;
    expect(main.classList).toContain('v2-main--wide');
    expect(main.className).not.toContain('standard');
  });
});
