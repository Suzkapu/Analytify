import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {V2NavigationDrawerComponent} from './v2-navigation-drawer.component';

function drawer(url = '/friends/request?view=received#pending') {
  TestBed.configureTestingModule({providers: [provideRouter([])]});
  const fixture = TestBed.createComponent(V2NavigationDrawerComponent);
  fixture.componentRef.setInput('currentUrl', url);
  fixture.componentRef.setInput('displayName', 'Long account name');
  fixture.detectChanges();
  return {fixture, element: fixture.nativeElement as HTMLElement};
}

describe('Canonical mobile navigation drawer', () => {
  it('keeps nested routes current, rejects sibling prefixes and updates without reopening', () => {
    const {fixture, element} = drawer();
    expect(element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Friends');
    fixture.componentRef.setInput('currentUrl', '/friendship'); fixture.detectChanges();
    expect(element.querySelector('[aria-current]')).toBeNull();
    fixture.componentRef.setInput('currentUrl', '/stats'); fixture.detectChanges();
    expect(element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('Stats');
  });
  it('exposes Administration only after a confirmed administrator result', () => {
    const {fixture, element} = drawer();
    expect(element.textContent).not.toContain('Administrator only');
    fixture.componentRef.setInput('isAdmin', true); fixture.detectChanges();
    expect(element.querySelector('a[href="/admin"]')?.textContent?.trim()).toBe('Administration');
    fixture.componentRef.setInput('isAdmin', false); fixture.detectChanges();
    expect(element.querySelector('a[href="/admin"]')).toBeNull();
  });
  it('renders account-owned identity and reports a broken avatar so the owner can restore initials', () => {
    const {fixture, element} = drawer();
    expect(element.querySelector('.drawer-avatar')?.textContent?.trim()).toBe('L');
    expect(element.querySelector('.drawer-identity strong')?.textContent).toBe('Long account name');
    const failed = vi.fn(); fixture.componentInstance.profileImageFailed.subscribe(failed);
    fixture.componentRef.setInput('profilePicUrl', 'https://images.example/avatar.webp'); fixture.detectChanges();
    const image = element.querySelector('.drawer-avatar img') as HTMLImageElement;
    expect(image.src).toBe('https://images.example/avatar.webp'); image.dispatchEvent(new Event('error'));
    expect(failed).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('profilePicUrl', null); fixture.componentRef.setInput('displayName', 'New account'); fixture.detectChanges();
    expect(element.querySelector('.drawer-avatar img')).toBeNull();
    expect(element.querySelector('.drawer-avatar')?.textContent?.trim()).toBe('N');
  });
  it('dismisses through the backdrop, logo and Escape using native controls', () => {
    const {fixture, element} = drawer(); const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    (element.querySelector('.drawer-backdrop') as HTMLButtonElement).click();
    (element.querySelector('.drawer-brand') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(dismissed).toHaveBeenCalledTimes(3);
    expect([...element.querySelectorAll('i')].every(icon => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
