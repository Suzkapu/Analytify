import {describe, expect, it} from 'vitest';
import {designInviteUrl, rankingLabel, recommendationParticipation, weeklyTaskCopy} from './song-league-view-model';

describe('Song League v2 view model', () => {
  it.each([
    [[], 4, '0 of 4 members ranked this'],
    [[{latestRank: 8}], 4, '1 of 4 members ranked this'],
    [[{latestRank: 8}, {latestRank: 2}, {latestRank: 1}], 3, '3 of 3 members ranked this']
  ])('summarizes recommendation participation', (rows, total, label) => {
    expect(recommendationParticipation(rows as any, total).label).toBe(label);
  });

  it('uses a dash for a member without a ranking', () => {
    expect(rankingLabel({latestRank: null, latestPoints: 0})).toBe('—');
    expect(rankingLabel({latestRank: 7, latestPoints: 94})).toBe('#7 · +94');
  });

  it('keeps open, submitted, closed, and waiting weekly tasks explicit', () => {
    expect(weeklyTaskCopy({isClosed: false, isDemo: false, isPickOpen: true, alreadySubmitted: false}).action)
      .toBe('Open Weekly Picks');
    expect(weeklyTaskCopy({isClosed: false, isDemo: false, isPickOpen: false, alreadySubmitted: true}).title)
      .toContain('locked in');
    expect(weeklyTaskCopy({isClosed: true, isDemo: false, isPickOpen: false, alreadySubmitted: false}).eyebrow)
      .toBe('League closed');
    expect(weeklyTaskCopy({isClosed: false, isDemo: false, isPickOpen: false, alreadySubmitted: false}).title)
      .toContain('Friday');
  });

  it('keeps invitations inside the selected design without altering their secret', () => {
    expect(designInviteUrl('https://analytify.example/song-league/join/secret-token', 'new'))
      .toBe('https://analytify.example/new/song-league/join/secret-token');
    expect(designInviteUrl('/song-league/join/secret-token', 'new')).toBe('/new/song-league/join/secret-token');
    expect(designInviteUrl('/song-league/join/secret-token', 'legacy')).toBe('/song-league/join/secret-token');
  });
});
