import {TestBed} from '@angular/core/testing';
import {provideRouter, Router} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {V2SettingsInstallComponent} from './v2-settings-install.component';

describe('installation guidance', () => {
  it('explains platform limitations and all five states, with Back returning to Notifications', async () => {
    TestBed.configureTestingModule({providers: [provideRouter([])]});
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(V2SettingsInstallComponent); fixture.detectChanges();
    const panel = fixture.nativeElement as HTMLElement;
    expect(panel.querySelectorAll('article')).toHaveLength(5);
    expect(panel.textContent).toContain('Share → Add to Home Screen');
    expect(panel.textContent).toContain('Choose Enable notifications in Settings');
    expect(panel.textContent).not.toContain('Turn on a category');
    (panel.querySelector('button') as HTMLButtonElement).click(); await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/settings', 'notifications']);
  });
});
