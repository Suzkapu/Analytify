import {
  DESIGN_V2_KNOWN_STATUSES,
  DesignV2KnownStatus,
  designV2StatusPresentation
} from './design-v2-status';

describe('designV2StatusPresentation', () => {
  it('maps every known backend status to readable copy and a semantic tone', () => {
    const expected: Record<DesignV2KnownStatus, string> = {
      active: 'Active', authorizing: 'Waiting for approval', cancelled: 'Cancelled', complete: 'Complete',
      connected: 'Connected', disabled: 'Off', error: 'Needs attention', failed: 'Failed',
      idle: 'Not started', invited: 'Invitation sent', loading: 'Loading', paused: 'Paused',
      pending: 'Pending', ready: 'Ready', revoked: 'Access removed', selecting: 'Choosing playlists',
      syncing: 'Updating'
    };

    expect(DESIGN_V2_KNOWN_STATUSES).toEqual(Object.keys(expected));
    for (const status of DESIGN_V2_KNOWN_STATUSES) {
      const presentation = designV2StatusPresentation(status);
      expect(presentation.label).toBe(expected[status]);
      expect(['neutral', 'success', 'warning', 'danger', 'info']).toContain(presentation.tone);
    }
    expect(designV2StatusPresentation('selecting').label).not.toContain('selecting');
    expect(designV2StatusPresentation('authorizing').label).not.toContain('authorizing');
  });
});
