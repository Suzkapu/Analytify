import {describe, expect, it} from 'vitest';
import {deepestDesignV2RouteData, designV2RouteData} from './design-v2-route-data';

describe('Design v2 route metadata', () => {
  it('creates semantic metadata without visual coordinates', () => {
    const data = designV2RouteData('stats', 'Stats', 'wide', 'insights', {preload: true});
    expect(data).toEqual({
      pageId: 'stats', mobileTitle: 'Stats', pageWidth: 'wide', ambientKey: 'insights', preload: true
    });
    expect(Object.keys(data)).not.toContain('coordinates');
  });

  it('uses the deepest route context while retaining parent defaults', () => {
    const data = deepestDesignV2RouteData({
      data: {pageWidth: 'standard', ambientKey: 'library'},
      firstChild: {data: {pageId: 'songs', mobileTitle: 'Songs'}, firstChild: null}
    });
    expect(data).toEqual({
      pageWidth: 'standard', ambientKey: 'library', pageId: 'songs', mobileTitle: 'Songs'
    });
  });
});
