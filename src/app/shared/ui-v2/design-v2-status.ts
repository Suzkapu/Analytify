export type DesignV2StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type DesignV2KnownStatus =
  | 'active'
  | 'authorizing'
  | 'cancelled'
  | 'complete'
  | 'connected'
  | 'disabled'
  | 'error'
  | 'failed'
  | 'idle'
  | 'invited'
  | 'loading'
  | 'paused'
  | 'pending'
  | 'ready'
  | 'revoked'
  | 'selecting'
  | 'syncing';

export interface DesignV2StatusPresentation {
  label: string;
  tone: DesignV2StatusTone;
}

const STATUS_PRESENTATIONS: Record<DesignV2KnownStatus, DesignV2StatusPresentation> = {
  active: {label: 'Active', tone: 'success'},
  authorizing: {label: 'Waiting for approval', tone: 'info'},
  cancelled: {label: 'Cancelled', tone: 'neutral'},
  complete: {label: 'Complete', tone: 'success'},
  connected: {label: 'Connected', tone: 'success'},
  disabled: {label: 'Off', tone: 'neutral'},
  error: {label: 'Needs attention', tone: 'danger'},
  failed: {label: 'Failed', tone: 'danger'},
  idle: {label: 'Not started', tone: 'neutral'},
  invited: {label: 'Invitation sent', tone: 'info'},
  loading: {label: 'Loading', tone: 'info'},
  paused: {label: 'Paused', tone: 'warning'},
  pending: {label: 'Pending', tone: 'warning'},
  ready: {label: 'Ready', tone: 'success'},
  revoked: {label: 'Access removed', tone: 'danger'},
  selecting: {label: 'Choosing playlists', tone: 'info'},
  syncing: {label: 'Updating', tone: 'info'}
};

export const designV2StatusPresentation = (status: DesignV2KnownStatus): DesignV2StatusPresentation =>
  STATUS_PRESENTATIONS[status];

export const DESIGN_V2_KNOWN_STATUSES = Object.freeze(
  Object.keys(STATUS_PRESENTATIONS) as DesignV2KnownStatus[]
);
