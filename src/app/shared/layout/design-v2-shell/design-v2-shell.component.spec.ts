import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {beforeEach, describe, expect, it} from 'vitest';

import {DESIGN_VARIANT} from '@core/navigation/design-variant';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {DesignV2ShellComponent} from './design-v2-shell.component';

@Component({standalone: true, template: '<h1>Playlists</h1>'})
class PlaylistsStubComponent {}

@Component({standalone: true, template: '<h1>Stats</h1>'})
class StatsStubComponent {}

describe('DesignV2ShellComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{
        path: 'new',
        component: DesignV2ShellComponent,
        providers: [{provide: DESIGN_VARIANT, useValue: 'new'}, DesignNavigationService],
        children: [
          {
            path: 'playlists', component: PlaylistsStubComponent, title: 'Playlists | Analytify',
            data: designV2RouteData('playlists', 'Your Playlists', 'wide', 'library', {preload: true})
          },
          {
            path: 'stats', component: StatsStubComponent, title: 'Stats | Analytify',
            data: designV2RouteData('stats', 'Your Stats', 'full', 'insights', {preload: true})
          }
        ]
      }])]
    });
  });

  it('keeps one shell instance mounted while child routes change', async () => {
    const harness = await RouterTestingHarness.create('/new/playlists');
    const first = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance;

    await harness.navigateByUrl('/new/stats');
    const second = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance;

    expect(second).toBe(first);
    expect(second.pageContext()).toEqual(expect.objectContaining({
      pageId: 'stats', title: 'Your Stats', width: 'full', ambientKey: 'insights'
    }));
  });

  it('renders desktop and mobile navigation from the same model with semantic active state', async () => {
    const harness = await RouterTestingHarness.create('/new/stats');
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
    const harness = await RouterTestingHarness.create('/new/playlists');
    const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent))
      .componentInstance as DesignV2ShellComponent;
    shell.toggleTools();
    harness.fixture.detectChanges();

    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.v2-overlay-host').length).toBe(1);
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    harness.fixture.detectChanges();
    expect(shell.toolsOpen()).toBe(false);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('provides a skip link and one main landmark', async () => {
    const harness = await RouterTestingHarness.create('/new/playlists');
    const element = harness.fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.v2-skip-link')?.getAttribute('href')).toBe('#v2-main-content');
    expect(element.querySelectorAll('main').length).toBe(1);
  });
});
