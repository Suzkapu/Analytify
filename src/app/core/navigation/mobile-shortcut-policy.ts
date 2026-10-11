export const MOBILE_SHORTCUT_IDS = ['playlists', 'stats', 'history', 'friends', 'song-league', 'private-sharing', 'compare-room'] as const;
export type MobileShortcutId = typeof MOBILE_SHORTCUT_IDS[number];
const defaults: readonly MobileShortcutId[] = ['playlists', 'stats', 'history'];

function isShortcutId(value: unknown): value is MobileShortcutId {
  return typeof value === 'string' && MOBILE_SHORTCUT_IDS.includes(value as MobileShortcutId);
}

export function decodeMobileShortcutPreference(raw: string | null): MobileShortcutId[] {
  if (raw === null) return [...defaults];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 5 || !parsed.every(isShortcutId)
      || new Set(parsed).size !== parsed.length) return [...defaults];
    return MOBILE_SHORTCUT_IDS.filter(id => parsed.includes(id));
  } catch {
    return [...defaults];
  }
}

export function toggleMobileShortcut(selection: readonly MobileShortcutId[], id: string): {selection: MobileShortcutId[]; limitReached: boolean} {
  if (!isShortcutId(id)) return {selection: [...selection], limitReached: false};
  const selected = selection.includes(id);
  if (!selected && selection.length >= 5) return {selection: [...selection], limitReached: true};
  const next = selected ? selection.filter(item => item !== id) : [...selection, id];
  return {selection: MOBILE_SHORTCUT_IDS.filter(item => next.includes(item)), limitReached: false};
}
