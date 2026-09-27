import {describe, expect, it} from 'vitest';
import {CompareParticipantStatus} from '@core/compare-room/compare-room.models';
import {compareProgressStep, localSelectionLabel, mergeModeView, participantStatusView} from './compare-room-view-model';

describe('Compare Room view model', () => {
  it.each<[CompareParticipantStatus, string]>([
    ['waiting', 'Waiting to join'],
    ['authorizing', 'Connecting to Spotify'],
    ['selecting', 'Choosing playlists'],
    ['loading', 'Loading songs'],
    ['ready', 'Ready'],
    ['disconnected', 'Disconnected'],
    ['saving', 'Creating playlist'],
    ['complete', 'Playlist created'],
    ['error', 'Needs attention']
  ])('maps %s without exposing the backend status', (status, label) => {
    expect(participantStatusView(status).label).toBe(label);
  });

  it('labels repeated local contributions as selections', () => {
    expect(localSelectionLabel({isMainProfile: true, localSlotNumber: 1, displayName: 'Alex'})).toBe('You');
    expect(localSelectionLabel({isMainProfile: true, localSlotNumber: 2, displayName: 'Alex'})).toBe('You · selection 2');
    expect(localSelectionLabel({isMainProfile: false, displayName: 'Sam'})).toBe('Sam');
  });

  it('keeps internal merge values behind clear labels', () => {
    expect(mergeModeView('intersection')).toEqual(expect.objectContaining({label: 'Songs everyone has'}));
    expect(mergeModeView('union')).toEqual(expect.objectContaining({label: 'All unique songs'}));
  });

  it('derives the progress step from readiness and proposal state', () => {
    expect(compareProgressStep(false, 0)).toBe(1);
    expect(compareProgressStep(false, 1)).toBe(2);
    expect(compareProgressStep(true, 0)).toBe(3);
  });
});
