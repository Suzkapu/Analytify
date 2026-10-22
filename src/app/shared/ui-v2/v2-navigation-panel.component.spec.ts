import {TestBed} from '@angular/core/testing';
import {Component} from '@angular/core';
import {provideRouter} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {V2NavigationPanelComponent} from './v2-navigation-panel.component';

@Component({standalone: true, template: '<h1>Settings</h1>'})
class SettingsStubComponent {}

describe('Shared canonical navigation panel', () => {
  it.each(['drawer', 'expanded', 'compact'] as const)('keeps accessible destinations and emits controlled brand intent in %s mode', async mode => {
    TestBed.configureTestingModule({providers: [provideRouter([{path: 'settings/account', component: SettingsStubComponent}])]});
    const fixture = TestBed.createComponent(V2NavigationPanelComponent);
    fixture.componentRef.setInput('currentUrl', '/friends/pending?view=received');
    fixture.componentRef.setInput('displayName', 'Test listener'); fixture.componentRef.setInput('mode', mode); fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const brand = element.querySelector('.drawer-brand') as HTMLButtonElement;
    expect(brand.getAttribute('aria-label')).toBe(mode === 'drawer' ? 'Close navigation menu' : mode === 'expanded' ? 'Collapse navigation sidebar' : 'Expand navigation sidebar');
    expect(brand.getAttribute('aria-expanded')).toBe(mode === 'drawer' ? null : String(mode === 'expanded'));
    expect(element.querySelector('.panel--compact') !== null).toBe(mode === 'compact');
    const links = [...element.querySelectorAll('.drawer-link')];
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists']);
    expect(element.querySelector('[aria-current="page"]')?.getAttribute('aria-label')).toBe('Friends');
    const requested = vi.fn(); fixture.componentInstance.brandActivated.subscribe(requested); brand.click(); fixture.detectChanges();
    expect(requested).toHaveBeenCalledOnce(); expect(fixture.componentInstance.mode()).toBe(mode);
    expect(element.querySelector('img')?.getAttribute('src')).toBe('assets/design-v2/product-logo.png');
    expect(element.querySelector('img')?.getAttribute('width')).toBe('32');
    const selected = vi.fn(); fixture.componentInstance.destinationSelected.subscribe(selected);
    element.querySelector('.drawer-profile')!.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    await fixture.whenStable();
    expect(selected).toHaveBeenCalledOnce();
  });
});
