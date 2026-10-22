import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {Subject} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {DesignV2MobileShortcutPreferencesService} from '@core/navigation/design-v2-mobile-shortcut-preferences.service';
import {V2SettingsNavigationComponent} from './v2-settings-navigation.component';

async function setup(configure?: (storage: {hydrateItems: ReturnType<typeof vi.fn>; getItem: ReturnType<typeof vi.fn>; setLocalItemDurably: ReturnType<typeof vi.fn>}) => void) {
  let saved: string | null = null;
  let exiting = false;
  const logout = new Subject<void>();
  const storage = {hydrateItems: vi.fn().mockResolvedValue(0), getItem: vi.fn(() => saved),
    setLocalItemDurably: vi.fn(async (_key: string, value: string) => {saved = value;})};
  configure?.(storage);
  TestBed.configureTestingModule({providers: [provideRouter([]),
    {provide: StorageService, useValue: storage},
    {provide: SpotifyAuthService, useValue: {sessionExiting: () => exiting, logout$: logout, getUserId: () => 'owner-A'}}]});
  const fixture = TestBed.createComponent(V2SettingsNavigationComponent);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string) => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)!;
  const settle = async () => {fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();};
  return {fixture, element, button, settle, storage, logout, beginExit: () => {exiting = true; logout.next();},
    service: TestBed.inject(DesignV2MobileShortcutPreferencesService)};
}

describe('Mounted device Navigation preferences', () => {
  it('does not repopulate shortcuts when the window receives focus during session exit', async () => {
    const {element, button, storage, beginExit, service, settle} = await setup();
    beginExit(); window.dispatchEvent(new Event('focus')); await settle();
    expect(service.selection()).toBeNull();
    expect(element.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(button('Friends').disabled).toBe(true);
    expect(storage.hydrateItems).toHaveBeenCalledOnce();
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });
  it('renders saved choices in canonical order and persists an explicitly empty selection', async () => {
    const {element, button, storage, settle} = await setup();
    expect([...element.querySelectorAll('.shortcut-choice')].map(item => item.textContent?.trim())).toEqual([
      'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare'
    ]);
    expect(element.textContent).toContain('3 of 5 shortcuts selected');
    for (const label of ['Playlists', 'Stats', 'History']) {button(label).click(); await settle();}
    expect(element.textContent).toContain('0 of 5 shortcuts selected');
    expect(element.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    expect(storage.setLocalItemDurably).toHaveBeenLastCalledWith('design-v2:mobile-shortcuts:owner-A', '[]');
  });
  it('blocks selection on a failed strict read and retries reading without writing defaults', async () => {
    const {element, button, storage, settle} = await setup(storage => {
      storage.hydrateItems.mockRejectedValueOnce(new Error('Device read unavailable'));
      storage.getItem.mockReturnValue('["friends"]');
    });
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Navigation preferences could not be loaded');
    expect([...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].every(item => item.disabled)).toBe(true);
    button('Retry').click(); await settle();
    expect(button('Friends').getAttribute('aria-pressed')).toBe('true');
    expect(element.textContent).toContain('1 of 5 shortcuts selected');
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });
  it('restores confirmed choices after a failed save and retries the exact requested selection', async () => {
    const {element, button, storage, settle} = await setup();
    storage.setLocalItemDurably.mockRejectedValueOnce(new Error('Device write unavailable'));
    button('Friends').click(); await settle();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Navigation changes could not be saved');
    expect(button('Friends').getAttribute('aria-pressed')).toBe('false');
    button('Retry').click(); await settle();
    expect(button('Friends').getAttribute('aria-pressed')).toBe('true');
    expect(storage.setLocalItemDurably.mock.calls).toEqual([
      ['design-v2:mobile-shortcuts:owner-A', '["playlists","stats","history","friends"]'],
      ['design-v2:mobile-shortcuts:owner-A', '["playlists","stats","history","friends"]']
    ]);
  });
  it('keeps the five-choice boundary, offers recovery by removing one and rejects duplicates during save', async () => {
    const {element, button, storage, settle} = await setup();
    let finish!: () => void;
    storage.setLocalItemDurably.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
    button('Friends').click(); button('Friends').click(); await settle();
    expect(element.textContent).toContain('Saving navigation preferences');
    expect(button('Friends').disabled).toBe(true);
    button('Friends').dispatchEvent(new MouseEvent('click', {bubbles: true})); await settle();
    expect(storage.setLocalItemDurably).toHaveBeenCalledOnce();
    finish(); await settle();
    button('Song Leagues').click(); await settle();
    button('Private Sharing').click(); await settle();
    expect(element.textContent).toContain('Five shortcuts selected. Remove one before adding another.');
    expect(storage.setLocalItemDurably).toHaveBeenCalledTimes(2);
    button('Friends').click(); await settle(); button('Private Sharing').click(); await settle();
    expect(button('Private Sharing').getAttribute('aria-pressed')).toBe('true');
    expect(element.textContent).toContain('5 of 5 shortcuts selected');
  });
  it('preserves cached choices during window-return refresh and clears them synchronously at logout', async () => {
    const {fixture, element, button, storage, service, logout, settle} = await setup();
    let finish!: () => void;
    storage.hydrateItems.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
    window.dispatchEvent(new Event('focus')); await settle();
    expect(element.textContent).toContain('Refreshing navigation preferences');
    expect(button('Playlists').getAttribute('aria-pressed')).toBe('true');
    expect(button('Playlists').disabled).toBe(true);
    logout.next(); fixture.detectChanges();
    expect(service.selection()).toBeNull();
    expect(element.textContent).not.toContain('3 of 5 shortcuts selected');
    expect(button('Playlists').getAttribute('aria-pressed')).toBe('false');
    finish(); await settle();
    expect(service.selection()).toBeNull();
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });
});
