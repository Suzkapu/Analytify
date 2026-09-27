import {CompareMergeMode, CompareParticipant, CompareParticipantStatus} from '@core/compare-room/compare-room.models';

export interface CompareStatusView {
  label: string;
  tone: 'neutral' | 'attention' | 'success' | 'danger';
}

export function participantStatusView(status: CompareParticipantStatus): CompareStatusView {
  switch (status) {
    case 'waiting': return {label: 'Waiting to join', tone: 'neutral'};
    case 'authorizing': return {label: 'Connecting to Spotify', tone: 'attention'};
    case 'selecting': return {label: 'Choosing playlists', tone: 'attention'};
    case 'loading': return {label: 'Loading songs', tone: 'attention'};
    case 'ready': return {label: 'Ready', tone: 'success'};
    case 'disconnected': return {label: 'Disconnected', tone: 'danger'};
    case 'saving': return {label: 'Creating playlist', tone: 'attention'};
    case 'complete': return {label: 'Playlist created', tone: 'success'};
    case 'error': return {label: 'Needs attention', tone: 'danger'};
  }
}

export function localSelectionLabel(participant: Pick<CompareParticipant, 'isMainProfile' | 'localSlotNumber' | 'displayName'>): string {
  if (!participant.isMainProfile) return participant.displayName;
  const slot = participant.localSlotNumber || 1;
  return slot === 1 ? 'You' : `You · selection ${slot}`;
}

export function mergeModeView(mode: CompareMergeMode): {label: string; description: string; action: string} {
  return mode === 'intersection'
    ? {label: 'Songs everyone has', description: 'Only tracks present in every selection', action: 'Compare songs everyone has'}
    : {label: 'All unique songs', description: 'Combine selections and remove duplicates', action: 'Combine all unique songs'};
}

export function compareProgressStep(hasProposal: boolean, readyCount: number): 1 | 2 | 3 {
  if (hasProposal) return 3;
  return readyCount > 0 ? 2 : 1;
}
