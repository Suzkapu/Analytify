import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {DesignV2ShellComponent} from './design-v2-shell.component';
import {AmbientBackgroundComponent} from '@shared/ambient/ambient-background.component';

@Component({standalone: true, template: '<h1>Playlists</h1>'})
class PlaylistsStubComponent {}

@Component({standalone: true, template: '<h1>Stats</h1>'})
class StatsStubComponent {}

describe('DesignV2ShellComponent', () => {
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
