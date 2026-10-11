import {describe, expect, it} from 'vitest';
import {decodeMobileShortcutPreference, toggleMobileShortcut} from './mobile-shortcut-policy';

const defaults = ['playlists', 'stats', 'history'];

describe('mobile shortcut preference policy', () => {
  it('uses the three canonical defaults only when no valid preference was saved', () => {
    expect(decodeMobileShortcutPreference(null)).toEqual(defaults);
    expect(decodeMobileShortcutPreference('')).toEqual(defaults);
    expect(decodeMobileShortcutPreference('[]')).toEqual([]);
  });

  it.each(['not json', 'null', '{}', 'false', '5', '"playlists"', '[null]', '[3]', '["unknown"]',
    '["playlists","playlists"]', '["playlists","stats","history","friends","song-league","private-sharing"]'])('recovers corrupt or unsupported saved choices without publishing them: %s', raw => {
    expect(decodeMobileShortcutPreference(raw)).toEqual(defaults);
  });

  it('projects valid choices in canonical order, including every retained destination', () => {
    expect(decodeMobileShortcutPreference('["compare-room","friends","private-sharing","song-league"]'))
      .toEqual(['friends', 'song-league', 'private-sharing', 'compare-room']);
  });

  it('allows five choices and refuses a sixth without removing an existing choice', () => {
    const selected = decodeMobileShortcutPreference('["playlists","stats","history","friends"]');
    const fifth = toggleMobileShortcut(selected, 'song-league');
    expect(fifth).toEqual({selection: ['playlists', 'stats', 'history', 'friends', 'song-league'], limitReached: false});
    expect(toggleMobileShortcut(fifth.selection, 'private-sharing'))
      .toEqual({selection: fifth.selection, limitReached: true});
    expect(selected).toEqual(['playlists', 'stats', 'history', 'friends']);
  });

  it('allows removing a selected shortcut at the limit and adding its replacement', () => {
    const selected = decodeMobileShortcutPreference('["playlists","stats","history","friends","song-league"]');
    const removed = toggleMobileShortcut(selected, 'stats');
    expect(removed).toEqual({selection: ['playlists', 'history', 'friends', 'song-league'], limitReached: false});
    expect(toggleMobileShortcut(removed.selection, 'compare-room'))
      .toEqual({selection: ['playlists', 'history', 'friends', 'song-league', 'compare-room'], limitReached: false});
  });

  it('preserves a chosen empty bar and can add a shortcut again', () => {
    const empty = toggleMobileShortcut(decodeMobileShortcutPreference('["history"]'), 'history');
    expect(empty).toEqual({selection: [], limitReached: false});
    expect(toggleMobileShortcut(empty.selection, 'stats')).toEqual({selection: ['stats'], limitReached: false});
  });

  it('rejects an unknown runtime action without changing choices or raising the five-item warning', () => {
    expect(toggleMobileShortcut(decodeMobileShortcutPreference('[]'), 'obsolete-feature'))
      .toEqual({selection: [], limitReached: false});
  });

  it('returns independent recovered preferences so one caller cannot corrupt another user defaults', () => {
    const recovered = decodeMobileShortcutPreference(null);
    recovered.splice(0);
    expect(decodeMobileShortcutPreference(null)).toEqual(defaults);
  });
});
