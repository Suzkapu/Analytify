import {describe, expect, it} from 'vitest';
import {groupHistoryByDay, rankMovementLabel, statsSearchPlaceholder} from './insights-view-model';

describe('insights view model', () => {
  it('uses category-specific search prompts', () => {
    expect(statsSearchPlaceholder('tracks')).toBe('Search songs or artists');
    expect(statsSearchPlaceholder('artists')).toBe('Search artists');
    expect(statsSearchPlaceholder('genres')).toBe('Search genres');
  });

  it('describes every movement without relying on color', () => {
    expect(rankMovementLabel({type: 'up', diff: 2})).toBe('↑2');
    expect(rankMovementLabel({type: 'down', diff: 3})).toBe('↓3');
    expect(rankMovementLabel({type: 'same'})).toBe('—');
    expect(rankMovementLabel({type: 'new'})).toBe('NEW');
  });

  it('groups chronology into stable day sections', () => {
    const groups = groupHistoryByDay([
      {played_at: '2026-09-26T10:00:00Z', id: 1},
      {played_at: '2026-09-26T08:00:00Z', id: 2},
      {played_at: '2026-09-25T10:00:00Z', id: 3}
    ], new Date('2026-09-26T12:00:00Z'));
    expect(groups.map(group => [group.label, group.items.length])).toEqual([['Today', 2], ['Yesterday', 1]]);
  });

  it('keeps malformed legacy timestamps visible in the current-day group', () => {
    const groups = groupHistoryByDay([{played_at: 'invalid', id: 1}], new Date('2026-09-26T12:00:00Z'));

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].items[0].id).toBe(1);
  });
});
