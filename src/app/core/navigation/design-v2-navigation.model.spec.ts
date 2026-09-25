import {describe, expect, it} from 'vitest';
import {
  DESIGN_V2_NAVIGATION,
  mobileDesignV2Navigation,
  primaryDesignV2Navigation,
  toolDesignV2Navigation
} from './design-v2-navigation.model';

describe('Design v2 navigation model', () => {
  it('drives desktop, mobile, and tool navigation from one model', () => {
    expect(primaryDesignV2Navigation().map(item => item.id)).toEqual(['playlists', 'stats', 'history']);
    expect(mobileDesignV2Navigation()).toEqual(primaryDesignV2Navigation());
    expect(toolDesignV2Navigation().map(item => item.id)).toEqual([
      'song-league', 'compare-room', 'private-sharing'
    ]);
    expect(new Set(DESIGN_V2_NAVIGATION.map(item => item.id)).size).toBe(DESIGN_V2_NAVIGATION.length);
  });

  it('keeps every item accessible by label and icon', () => {
    for (const item of DESIGN_V2_NAVIGATION) {
      expect(item.label.trim()).not.toBe('');
      expect(item.icon).toMatch(/^pi-/);
    }
  });
});
