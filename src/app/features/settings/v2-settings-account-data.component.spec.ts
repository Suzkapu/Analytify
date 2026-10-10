import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {DesignV2ShellComponent} from '@shared/layout/design-v2-shell/design-v2-shell.component';
import {DESIGN_V2_ACCOUNT_ACTIONS} from '@shared/layout/design-v2-shell/design-v2-account-actions';
import {V2SettingsPageComponent} from './v2-settings-page.component';
import {V2SettingsAccountComponent, V2SettingsDataComponent} from './v2-settings-account-data.component';

@Component({standalone: true, template: '<h1>Playlists</h1>'})
class PlaylistsStubComponent {}

describe('Settings composition with the protected shell actions', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideRouter([{
      path: '', component: DesignV2ShellComponent, children: [
        {path: 'playlists', component: PlaylistsStubComponent,
          data: designV2RouteData('playlists', 'Your Playlists', 'wide', 'library')},
        {path: 'settings', component: V2SettingsPageComponent,
          data: designV2RouteData('settings', 'Settings', 'full', 'account'), children: [
            {path: 'account', component: V2SettingsAccountComponent},
            {path: 'data', component: V2SettingsDataComponent}
          ]}
      ]
    }])]});
  });

  async function createShell() {
    const harness = await RouterTestingHarness.create('/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
    return {harness, shell};
  }

  it('opens the protected clear-data chooser from Settings without deleting or logging out', async () => {
    const {harness, shell} = await createShell();
    const deletion = vi.spyOn(TestBed.inject(SupabaseService), 'deleteUserProfileData').mockResolvedValue(undefined);
    const logout = vi.spyOn(shell.authService, 'logout').mockResolvedValue(undefined);
    await harness.navigateByUrl('/settings/data');
    (harness.fixture.nativeElement.querySelector('v2-settings-data .v2-settings-danger') as HTMLButtonElement).click();
    harness.fixture.detectChanges();
    expect(shell.clearDataStep()).toBe('choose');
    expect(deletion).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled();
    shell.closeConfirmation(); harness.fixture.detectChanges();
    expect(shell.clearDataStep()).toBe('none');
    expect(TestBed.inject(Router).url).toBe('/settings/data');
  });

  it('keeps the Settings backup switch off until consent and allows cancellation without service changes', async () => {
    const {harness, shell} = await createShell();
    vi.spyOn(shell.authService, 'isBackupActive').mockReturnValue(false);
    const enable = vi.spyOn(shell.authService, 'enableBackup').mockResolvedValue(undefined);
    await harness.navigateByUrl('/settings/data');
    const input = harness.fixture.nativeElement.querySelector('v2-settings-data input') as HTMLInputElement;
    input.click(); harness.fixture.detectChanges();
    expect(input.checked).toBe(false); expect(shell.backupConfirmationOpen()).toBe(true);
    expect(enable).not.toHaveBeenCalled();
    shell.closeConfirmation(); harness.fixture.detectChanges();
    expect(shell.backupConfirmationOpen()).toBe(false); expect(enable).not.toHaveBeenCalled();
  });

  it('shows shared failures and blocks every Settings data action while an operation is pending', async () => {
    const {harness, shell} = await createShell();
    await harness.navigateByUrl('/settings/data');
    shell.actionRunning.set(true); shell.actionError.set('Cloud Backup could not be disabled. Try again.');
    harness.fixture.detectChanges();
    const panel = harness.fixture.nativeElement.querySelector('v2-settings-data') as HTMLElement;
    expect([...panel.querySelectorAll('button, input')].every(control => (control as HTMLButtonElement).disabled)).toBe(true);
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain('Try again');
    for (const button of panel.querySelectorAll('button')) button.click();
    shell.requestBackupEnable();
    expect(shell.backupConfirmationOpen()).toBe(false); expect(shell.clearDataStep()).toBe('none');
    expect(shell.actionError()).toContain('Try again');
    shell.actionRunning.set(false); harness.fixture.detectChanges();
    (panel.querySelector('.v2-settings-destination') as HTMLButtonElement).click();
    expect(shell.backupConfirmationOpen()).toBe(true); expect(shell.actionError()).toBe('');
  });

});
