import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {DesignV2MobileShortcutPreferencesService} from './design-v2-mobile-shortcut-preferences.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const key = (actor: string) => `design-v2:mobile-shortcuts:${actor}`;
describe('Per-user device shortcut preferences', () => {
  let actor: string | null;
  let lifecycle: SessionLifecycleService;
  let service: DesignV2MobileShortcutPreferencesService;
  let values: Map<string, string>;
  let logout: Subject<void>;
  let exiting: boolean;
  let storage: {hydrateItems: ReturnType<typeof vi.fn>; getItem: ReturnType<typeof vi.fn>; setLocalItemDurably: ReturnType<typeof vi.fn>};
  beforeEach(() => {
    actor = 'owner-A'; values = new Map(); lifecycle = new SessionLifecycleService(); logout = new Subject<void>(); exiting = false;
    storage = {
      hydrateItems: vi.fn().mockResolvedValue(0),
      getItem: vi.fn((entry: string) => values.get(entry) ?? null),
      setLocalItemDurably: vi.fn(async (entry: string, value: string) => {values.set(entry, value);})
    };
    TestBed.configureTestingModule({providers: [DesignV2MobileShortcutPreferencesService,
      {provide: SpotifyAuthService, useValue: {sessionExiting: () => exiting, logout$: logout, getUserId: () => actor}},
      {provide: SessionLifecycleService, useValue: lifecycle}, {provide: StorageService, useValue: storage}]});
    service = TestBed.inject(DesignV2MobileShortcutPreferencesService);
  });

  it('blocks cached actions and reads as soon as exit starts, before logout subscribers run', async () => {
    await service.load(); exiting = true;
    await service.toggle('friends'); await service.reload(); await service.load(); await service.retry();
    expect(service.selection()).toBeNull();
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    expect(storage.hydrateItems).toHaveBeenCalledOnce();
    exiting = false; await service.load();
    expect(service.selection()).toEqual(['playlists', 'stats', 'history']);
  });

  it('clears cached shortcuts and a pending draft on logout before actor storage changes', async () => {
    await service.load();
    const held = deferred<void>(); storage.setLocalItemDurably.mockReturnValueOnce(held.promise);
    const saving = service.toggle('friends');
    expect(service.selection()).toContain('friends');
    logout.next();
    expect(service.selection()).toBeNull();
    expect(service.feedback()).toBe('');
    held.reject(new Error('Old save failed')); await saving;
    expect(service.selection()).toBeNull();
    expect(service.error()).toBe('');
    actor = 'owner-B'; values.set(key('owner-B'), '[]'); await service.load(); await service.retry();
    expect(service.selection()).toEqual([]);
    expect(storage.setLocalItemDurably).toHaveBeenCalledTimes(1);
  });

  it('loads defaults only after a successful strict device read', async () => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const load = service.load();
    expect(service.selection()).toBeNull(); expect(service.loading()).toBe(true);
    expect(storage.hydrateItems).toHaveBeenCalledWith([key('owner-A')], {readFailure: 'reject'});
    held.resolve(0); await load;
    expect(service.selection()).toEqual(['playlists', 'stats', 'history']);
    expect(service.loading()).toBe(false); expect(service.error()).toBe('');
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });

  it.each(['[]', '["friends","stats"]'])('retains valid saved input %s in canonical order', async raw => {
    values.set(key('owner-A'), raw); await service.load();
    expect(service.selection()).toEqual(raw === '[]' ? [] : ['stats', 'friends']);
  });

  it('recovers malformed input without silently rewriting disk', async () => {
    values.set(key('owner-A'), 'not-json'); await service.load();
    expect(service.selection()).toEqual(['playlists', 'stats', 'history']);
    expect(values.get(key('owner-A'))).toBe('not-json');
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });

  it('joins a duplicate initial load and keeps the cached choices on later navigation', async () => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const first = service.load(); const second = service.load();
    expect(storage.hydrateItems).toHaveBeenCalledTimes(1);
    held.resolve(0); await Promise.all([first, second]); await service.load();
    expect(storage.hydrateItems).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed read as default choices and can retry', async () => {
    storage.hydrateItems.mockRejectedValueOnce(new Error('Isolated read failure'));
    await service.load(); expect(service.selection()).toBeNull();
    expect(service.feedback()).toBe('load-error'); expect(service.error()).not.toBe('');
    await service.toggle('friends'); expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    values.set(key('owner-A'), '[]'); await service.retry();
    expect(service.selection()).toEqual([]); expect(service.error()).toBe('');
  });

  it('updates selection immediately, blocks duplicate changes, and commits the account-specific key', async () => {
    await service.load(); const held = deferred<void>(); storage.setLocalItemDurably.mockReturnValueOnce(held.promise);
    const save = service.toggle('friends');
    expect(service.selection()).toEqual(['playlists','stats','history','friends']);
    expect(service.saving()).toBe(true);
    await service.toggle('song-league'); await service.reload(); await service.retry();
    expect(storage.setLocalItemDurably).toHaveBeenCalledExactlyOnceWith(key('owner-A'), '["playlists","stats","history","friends"]');
    expect(storage.hydrateItems).toHaveBeenCalledTimes(1);
    held.resolve(); await save; expect(service.saving()).toBe(false); expect(service.feedback()).toBe('');
  });

  it('restores the saved choices after a write failure and retries the same attempted choice', async () => {
    await service.load(); storage.setLocalItemDurably.mockRejectedValueOnce(new Error('Isolated quota failure'));
    await service.toggle('friends');
    expect(service.selection()).toEqual(['playlists','stats','history']);
    expect(service.feedback()).toBe('save-error'); expect(service.saving()).toBe(false);
    expect(service.error()).toBe('Navigation changes could not be saved');
    await service.retry(); expect(service.selection()).toEqual(['playlists','stats','history','friends']);
    expect(storage.setLocalItemDurably.mock.calls).toEqual([
      [key('owner-A'), '["playlists","stats","history","friends"]'],
      [key('owner-A'), '["playlists","stats","history","friends"]']]);
    expect(service.error()).toBe('');
  });

  it('allows a new choice instead of replaying a failed draft', async () => {
    await service.load(); storage.setLocalItemDurably.mockRejectedValueOnce(new Error('Isolated failure'));
    await service.toggle('friends'); await service.toggle('history');
    expect(service.selection()).toEqual(['playlists','stats']); expect(service.error()).toBe('');
    expect(values.get(key('owner-A'))).toBe('["playlists","stats"]');
  });

  it('refuses a sixth choice but allows removal at the five-shortcut boundary', async () => {
    values.set(key('owner-A'), '["playlists","stats","history","friends","song-league"]'); await service.load();
    await service.toggle('compare-room');
    expect(service.limitMessage()).toBe('Five shortcuts selected. Remove one before adding another.');
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    await service.toggle('history');
    expect(service.selection()).toEqual(['playlists','stats','friends','song-league']);
    expect(service.limitMessage()).toBe('');
  });

  it('saves an explicit zero rather than replacing it with defaults', async () => {
    values.set(key('owner-A'), '["stats"]'); await service.load(); await service.toggle('stats');
    expect(service.selection()).toEqual([]); expect(values.get(key('owner-A'))).toBe('[]');
  });

  it('ignores unsupported actions without writing', async () => {
    await service.load(); await service.toggle('admin-runtime-health');
    expect(service.selection()).toEqual(['playlists','stats','history']);
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });

  it('preserves cached choices while refreshing and blocks changes during the read', async () => {
    await service.load(); const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const refresh = service.reload(); expect(service.feedback()).toBe('refreshing');
    expect(service.selection()).toEqual(['playlists','stats','history']);
    await service.toggle('friends'); expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    held.resolve(0); await refresh;
  });

  it('preserves cached choices after refresh failure but requires Retry before new changes', async () => {
    await service.load(); storage.hydrateItems.mockRejectedValueOnce(new Error('Isolated read failure'));
    await service.reload(); await service.toggle('friends');
    expect(service.selection()).toEqual(['playlists','stats','history']);
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    await service.retry(); await service.toggle('friends');
    expect(service.selection()).toContain('friends');
  });

  it('does not read or save device choices while signed out', async () => {
    actor = null; await service.load(); await service.toggle('friends'); await service.retry();
    expect(service.selection()).toBeNull(); expect(service.loading()).toBe(false);
    expect(storage.hydrateItems).not.toHaveBeenCalled(); expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });

  it('rejects actions based on a previous account without saving into the replacement key', async () => {
    await service.load(); actor = 'owner-B'; await service.toggle('friends');
    expect(service.selection()).toBeNull(); expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    values.set(key('owner-B'), '[]'); await service.load(); expect(service.selection()).toEqual([]);
  });

  it.each(['success','failure'])('drops old-account load %s after replacement load succeeds', async outcome => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const old = service.load(); actor = 'owner-B'; values.set(key('owner-B'), '[]'); await service.load();
    if (outcome === 'success') held.resolve(0); else held.reject(new Error('Old account failure'));
    await old; expect(service.selection()).toEqual([]); expect(service.error()).toBe('');
  });

  it.each(['success','failure'])('drops old-account save %s after replacement choices load', async outcome => {
    await service.load(); const held = deferred<void>(); storage.setLocalItemDurably.mockReturnValueOnce(held.promise);
    const old = service.toggle('friends'); actor = 'owner-B'; values.set(key('owner-B'), '[]'); await service.load();
    if (outcome === 'success') held.resolve(); else held.reject(new Error('Old account failure'));
    await old; expect(service.selection()).toEqual([]); expect(service.saving()).toBe(false); expect(service.error()).toBe('');
    expect(storage.setLocalItemDurably.mock.calls.every(([entry]) => entry === key('owner-A'))).toBe(true);
  });

  it('never retries an old account failed draft for a new account', async () => {
    await service.load(); storage.setLocalItemDurably.mockRejectedValueOnce(new Error('Isolated failure'));
    await service.toggle('friends'); actor = 'owner-B'; values.set(key('owner-B'), '[]'); await service.retry();
    expect(service.selection()).toEqual([]); expect(storage.setLocalItemDurably).toHaveBeenCalledTimes(1);
  });

  it('discards a delayed read after the same account session is replaced', async () => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const old = service.load(); await lifecycle.invalidateAndDrain(); held.resolve(0); await old;
    expect(service.selection()).toBeNull(); expect(service.loading()).toBe(false);
    values.set(key('owner-A'), '[]'); await service.load(); expect(service.selection()).toEqual([]);
  });

  it('clears a delayed save after the same account session ends', async () => {
    await service.load(); const held = deferred<void>(); storage.setLocalItemDurably.mockReturnValueOnce(held.promise);
    const save = service.toggle('friends'); await lifecycle.invalidateAndDrain(); held.resolve(); await save;
    expect(service.selection()).toBeNull(); expect(service.saving()).toBe(false); expect(service.error()).toBe('');
  });

  it('blocks changes and Retry while the first preference read is pending', async () => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const load = service.load(); await service.toggle('friends'); await service.retry();
    expect(storage.hydrateItems).toHaveBeenCalledTimes(1); expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
    held.resolve(0); await load;
  });

  it('keeps the newest explicit refresh when an older same-account read finishes late', async () => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const old = service.load(); storage.getItem.mockReturnValueOnce('["friends"]'); await service.reload();
    storage.getItem.mockReturnValue('[]'); held.resolve(0); await old;
    expect(service.selection()).toEqual(['friends']); expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it('ignores delayed completion and subsequent actions after destruction', async () => {
    const held = deferred<number>(); storage.hydrateItems.mockReturnValueOnce(held.promise);
    const old = service.load(); service.ngOnDestroy(); held.resolve(0); await old;
    await service.load(); await service.reload(); await service.toggle('friends'); await service.retry();
    expect(service.selection()).toBeNull(); expect(storage.hydrateItems).toHaveBeenCalledTimes(1);
    expect(storage.setLocalItemDurably).not.toHaveBeenCalled();
  });
});
