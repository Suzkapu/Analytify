import {describe, expect, it} from 'vitest';
import {AdminUserScheduleDraft, hasValidUserIntervals} from './admin-user-interval-validation';

function draft(overrides: Partial<AdminUserScheduleDraft> = {}): AdminUserScheduleDraft {
  return {
    userId: 'synthetic-listener', spotifyId: 'synthetic-listener', displayName: 'Synthetic listener',
    profilePicUrl: '', backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'Europe/Vienna',
    historyEnabled: true, historyIntervalMinutes: 60, historyIntervalUnit: 'minutes',
    shortTermEnabled: false, shortTermIntervalHours: 24, shortTermIntervalUnit: 'hours',
    mediumTermEnabled: false, mediumTermIntervalHours: 7, mediumTermIntervalUnit: 'days',
    longTermEnabled: false, longTermIntervalHours: 7, longTermIntervalUnit: 'days',
    songLeaguePlaylistsEnabled: false, songLeaguePlaylistFridaysOnly: true,
    songLeaguePlaylistIntervalMinutes: 60, songLeaguePlaylistIntervalUnit: 'minutes',
    sharedPlaylistsEnabled: true, sharedPlaylistIntervalMinutes: 60, sharedPlaylistIntervalUnit: 'minutes',
    lastSuccessAt: null, lastError: null, ...overrides
  };
}

describe('user schedule draft raw interval validation', () => {
  it('accepts a complete persisted schedule without mutating its metadata or choices', () => {
    const candidate = draft();
    const before = structuredClone(candidate);
    expect(hasValidUserIntervals(candidate)).toBe(true);
    expect(candidate).toEqual(before);
  });

  it.each([
    ['cleared listening history', {historyIntervalMinutes: null}],
    ['zero short-term interval', {shortTermIntervalHours: 0}],
    ['negative medium-term interval', {mediumTermIntervalHours: -1}],
    ['fractional long-term interval', {longTermIntervalHours: 1.5}],
    ['nonfinite League interval', {songLeaguePlaylistIntervalMinutes: Infinity}],
    ['excessive shared interval', {sharedPlaylistIntervalMinutes: 10081}],
    ['not-a-number history interval', {historyIntervalMinutes: NaN}],
    ['negative-infinite shared interval', {sharedPlaylistIntervalMinutes: -Infinity}]
  ] satisfies [string, Partial<AdminUserScheduleDraft>][])(
    'rejects %s and preserves the invalid draft for correction', (_description, changes) => {
      const candidate = draft(changes);
      const before = structuredClone(candidate);
      expect(hasValidUserIntervals(candidate)).toBe(false);
      expect(candidate).toEqual(before);
    }
  );

  it('accepts the raw lower and upper integer boundaries across different task units', () => {
    expect(hasValidUserIntervals(draft({
      historyIntervalMinutes: 1, shortTermIntervalHours: 10080,
      mediumTermIntervalHours: 1, longTermIntervalHours: 10080,
      songLeaguePlaylistIntervalMinutes: 1, sharedPlaylistIntervalMinutes: 10080
    }))).toBe(true);
  });

  it('leaves converted-duration and policy checks to the server instead of treating every task as the policy editor', () => {
    expect(hasValidUserIntervals(draft({
      songLeaguePlaylistsEnabled: true, songLeaguePlaylistIntervalMinutes: 10080,
      songLeaguePlaylistIntervalUnit: 'days', sharedPlaylistIntervalMinutes: 10080,
      sharedPlaylistIntervalUnit: 'days', historyIntervalMinutes: 1
    }))).toBe(true);
  });

  it('requires complete stored intervals even when optional schedules are disabled', () => {
    expect(hasValidUserIntervals(draft({enabled: false, shortTermEnabled: false, shortTermIntervalHours: null}))).toBe(false);
  });
});
