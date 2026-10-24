import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {V2FriendsFeedbackComponent} from '../../src/app/shared/ui-v2/v2-friends-feedback.component';

@Component({
  standalone: true,
  imports: [V2FriendsFeedbackComponent],
  template: '<div class="design-v2"><v2-friends-feedback state="profile-required" /></div>',
  styleUrl: '../../src/app/shared/layout/design-v2-shell/design-v2-shell.component.scss',
})
class NativeFeedbackHost {}

describe('native defensive Friends feedback', () => {
  it.each([{width: 576, height: 82}, {width: 358, height: 102}])('renders the real profile-required alert at $width px', async ({width, height}) => {
    await page.viewport(800, 600);
    const fixture = TestBed.createComponent(NativeFeedbackHost);
    fixture.nativeElement.style.width = `${width}px`;
    fixture.detectChanges();
    await fixture.whenStable();
    // Explicitly request both production faces before measuring native line wrapping.
    await Promise.all([
      document.fonts.load('400 14px "Outfit Variable"'),
      document.fonts.load('600 14px "Outfit Variable"'),
    ]);
    await document.fonts.ready;
    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Confirm your Spotify account');
    expect(alert.querySelectorAll('button, a')).toHaveLength(0);
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    expect(alert.getBoundingClientRect().width).toBe(width);
    expect(alert.getBoundingClientRect().height).toBe(height);
    const style = getComputedStyle(alert);
    expect(style.backgroundColor).toBe('rgb(24, 32, 25)');
    expect(style.borderColor).toBe('rgb(119, 184, 255)');
    expect(style.color).toBe('rgb(162, 173, 166)');
    expect(getComputedStyle(alert.querySelector('h3')!).color).toBe('rgb(119, 184, 255)');
    expect(document.fonts.check('600 14px "Outfit Variable"')).toBe(true);
    await expect.element(alert).toMatchScreenshot(`profile-required-${width}.png`);
    fixture.destroy();
  });
});
