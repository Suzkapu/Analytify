import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {describe, expect, it} from 'vitest';
import {V2DestinationRowComponent, V2SettingsNavigationComponent} from './v2-settings-navigation.component';

@Component({standalone: true, template: '<h1>Destination</h1>'})
class Destination {}

@Component({
  standalone: true, imports: [V2SettingsNavigationComponent, V2DestinationRowComponent],
  template: `
    <v2-settings-navigation [destinations]="destinations" />
    <v2-destination-row label="Legal & privacy" iconUrl="assets/design-v2/navigation-back.svg" [commands]="['/legal']" />
    <v2-destination-row label="Spotify connection" iconUrl="assets/design-v2/navigation-back.svg" externalHref="https://www.spotify.com/account/apps/" />
  `
})
class SettingsNavigationHost {
  destinations = [
    {id: 'account', label: 'Account', commands: ['/settings/account'], iconUrl: 'assets/design-v2/stats-category-user.svg'},
    {id: 'notifications', label: 'Notifications', mobileLabel: 'Alerts', commands: ['/settings/notifications'], iconUrl: 'assets/design-v2/stats-category-star.svg'},
    {id: 'navigation', label: 'Navigation', commands: ['/settings/navigation'], iconUrl: 'assets/design-v2/stats-category-songs.svg', mobileOnly: true}
  ];
}

async function setup(path = '/settings/account') {
  TestBed.configureTestingModule({providers: [provideRouter([
    {path: 'settings', component: SettingsNavigationHost, children: [{path: ':section', component: Destination}]},
    {path: 'legal', component: Destination}
  ])]});
  const harness = await RouterTestingHarness.create(path);
  return {harness, element: harness.fixture.nativeElement as HTMLElement, router: TestBed.inject(Router)};
}

describe('canonical Settings navigation', () => {
  it('exposes native destination links with exactly one current page', async () => {
    const {element} = await setup();
    const nav = element.querySelector('nav[aria-label="Settings sections"]')!;
    expect(nav).not.toBeNull();
    expect([...nav.querySelectorAll('a')].map(a => a.getAttribute('href')))
      .toEqual(['/settings/account', '/settings/notifications', '/settings/navigation']);
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain('Account');
    expect(nav.querySelector('button')).toBeNull();
  });

  it('navigates and updates the selected destination without manufacturing a tab state', async () => {
    const {harness, element, router} = await setup();
    (element.querySelector('a[href="/settings/notifications"]') as HTMLAnchorElement).click();
    await harness.fixture.whenStable(); harness.fixture.detectChanges();
    expect(router.url).toBe('/settings/notifications');
    expect(element.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/settings/notifications');
    expect(element.querySelector('a[href="/settings/account"]')?.hasAttribute('aria-current')).toBe(false);
  });

  it('keeps the current section selected when its URL has a query or fragment', async () => {
    const {element} = await setup('/settings/account?from=menu#profile');
    expect(element.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/settings/account');
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('keeps one accessible notification name while offering the compact mobile label', async () => {
    const {element} = await setup();
    const link = element.querySelector('a[href="/settings/notifications"]')!;
    expect(link.getAttribute('aria-label')).toBe('Notifications');
    expect(link.querySelector('.v2-settings-navigation__mobile-label')?.textContent).toBe('Alerts');
    const icons = element.querySelectorAll('nav img');
    expect(icons).toHaveLength(3);
    expect([...icons].every(icon => icon.getAttribute('alt') === '')).toBe(true);
  });

  it('opens the legal row through the router and leaves service data untouched', async () => {
    const {harness, element, router} = await setup();
    const row = element.querySelector('v2-destination-row a[href="/legal"]') as HTMLAnchorElement;
    expect(row.textContent).toContain('Legal & privacy');
    expect(row.getAttribute('target')).toBeNull(); row.click();
    await harness.fixture.whenStable(); expect(router.url).toBe('/legal');
  });

  it('opens Spotify access as a protected external link without changing the application route', async () => {
    const {element, router} = await setup();
    const link = element.querySelector('a[href="https://www.spotify.com/account/apps/"]')!;
    expect(link.textContent).toContain('Spotify connection');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(router.url).toBe('/settings/account');
  });
});
