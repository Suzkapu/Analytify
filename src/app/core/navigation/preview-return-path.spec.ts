import {describe, expect, it} from 'vitest';
import {previewReturnPath} from './preview-return-path';

describe('root OAuth return paths', () => {
  it('preserves root paths and normalizes legacy preview links with query and fragment', () => {
    expect(previewReturnPath('/stats?range=short_term#history')).toBe('/stats?range=short_term#history');
    expect(previewReturnPath('/new/stats?range=short_term#history')).toBe('/stats?range=short_term#history');
    expect(previewReturnPath('/newness')).toBe('/newness');
    expect(previewReturnPath('/new')).toBe('/');
  });
  it('cannot return to an external origin', () => {
    for (const path of ['//evil.example', 'https://evil.example', '/new//evil.example', '/\\evil.example']) {
      expect(previewReturnPath(path)).toBe('/playlists');
    }
  });
});
