import {describe, expect, it} from 'vitest';
import {moderationStatusLabel, parseSharingTab, statsAccessStatusView} from './sharing-view-model';

describe('sharing view model', () => {
  it('restores only supported tab values', () => {
    expect(parseSharingTab('stats')).toBe('stats');
    expect(parseSharingTab('playlists')).toBe('playlists');
    expect(parseSharingTab('internal-value')).toBe('playlists');
    expect(parseSharingTab(null)).toBe('playlists');
  });

  it.each([
    ['pending', 'viewer', 'Waiting for approval'],
    ['pending', 'owner', 'Needs your decision'],
    ['approved', 'viewer', 'Access active'],
    ['approved', 'owner', 'Access active'],
    ['declined', 'viewer', 'Declined'],
    ['declined', 'owner', 'Declined'],
    ['revoked', 'viewer', 'Access ended'],
    ['revoked', 'owner', 'Access ended']
  ] as const)('maps %s/%s without exposing backend copy', (status, role, label) => {
    expect(statsAccessStatusView(status, role).label).toBe(label);
  });

  it('maps every moderation status to user-facing language', () => {
    expect(['submitted', 'under_review', 'resolved_action', 'resolved_no_action', 'appealed']
      .map(status => moderationStatusLabel(status as any)))
      .toEqual(['Report received', 'Under review', 'Action taken', 'Review complete', 'Appeal under review']);
  });
});
