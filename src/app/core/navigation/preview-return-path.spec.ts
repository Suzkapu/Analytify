import {describe, expect, it} from 'vitest';
import {previewReturnPath} from './preview-return-path';

describe('preview OAuth return paths', () => {
  it('adds the mount point exactly once and preserves query and fragment', () => {
    expect(previewReturnPath('/stats?range=short_term#history')).toBe('/new/stats?range=short_term#history');
    expect(previewReturnPath('/new/stats?range=short_term#history')).toBe('/new/stats?range=short_term#history');
    expect(previewReturnPath('/newness')).toBe('/new/newness');
  });
  it('cannot return to an external origin', () => {
    expect(previewReturnPath('//evil.example')).toBe('/new/playlists');
    expect(previewReturnPath('https://evil.example')).toBe('/new/playlists');
  });
});
