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

  it('renders the current account through the same controller while Settings sections change', async () => {
    const {harness, shell} = await createShell();
    shell.displayName.set('A long Spotify account name');
    shell.profilePicUrl.set('https://images.example.test/profile.png');
    await harness.navigateByUrl('/settings/account');
    const panel = harness.fixture.debugElement.query(By.directive(V2SettingsAccountComponent));
    expect(panel.injector.get(DESIGN_V2_ACCOUNT_ACTIONS)).toBe(shell);
    expect(panel.nativeElement.querySelector('h2').textContent).toBe('A long Spotify account name');
    panel.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    harness.fixture.detectChanges();
    expect(panel.nativeElement.querySelector('img')).toBeNull();
    expect(panel.nativeElement.querySelector('.v2-settings-profile__avatar').textContent.trim()).toBe('A');
    const dataLink = panel.nativeElement.closest('v2-page').querySelector('a[href="/settings/data"]') as HTMLAnchorElement;
    dataLink.click(); await harness.fixture.whenStable(); harness.fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/settings/data');
    expect(harness.fixture.debugElement.query(By.directive(V2SettingsDataComponent)).injector.get(DESIGN_V2_ACCOUNT_ACTIONS)).toBe(shell);
    expect(harness.fixture.nativeElement.querySelector('[aria-current="page"]').textContent).toContain('Data');
  });

});
