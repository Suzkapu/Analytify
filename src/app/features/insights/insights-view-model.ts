export type InsightsCategory = 'tracks' | 'artists' | 'genres';
export type RankMovement = {type: 'up' | 'down' | 'same' | 'new'; diff?: number};

export function statsSearchPlaceholder(category: InsightsCategory): string {
  if (category === 'tracks') return 'Search songs or artists';
  if (category === 'artists') return 'Search artists';
  return 'Search genres';
}

export function rankMovementLabel(movement: RankMovement): string {
  if (movement.type === 'new') return 'NEW';
  if (movement.type === 'same') return '—';
  const amount = Math.max(0, Number(movement.diff) || 0);
  return `${movement.type === 'up' ? '↑' : '↓'}${amount}`;
}

export interface HistoryDayGroup<T = any> {
  key: string;
  label: string;
  items: T[];
}

export function groupHistoryByDay<T extends {played_at?: string}>(items: T[], now = new Date()): HistoryDayGroup<T>[] {
  const formatter = new Intl.DateTimeFormat(undefined, {weekday: 'long', month: 'short', day: 'numeric'});
  const keyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const todayKey = keyFor(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = keyFor(yesterday);
  const groups = new Map<string, HistoryDayGroup<T>>();

  for (const item of items) {
    const date = new Date(item.played_at || '');
    const validDate = Number.isFinite(date.getTime()) ? date : now;
    const key = keyFor(validDate);
    const label = key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatter.format(validDate);
    const group = groups.get(key) ?? {key, label, items: []};
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}
