import {describe, expect, it, vi} from 'vitest';
import {forwardToPreview} from './preview-handoff.component';

describe('preview document handoff', () => {
  it('keeps the complete local return path, query and fragment', () => {
    const assign = vi.fn();
    forwardToPreview('/new/stats?range=short_term#history', {assign});
    expect(assign).toHaveBeenCalledWith('/new/stats?range=short_term#history');
  });

  it('rejects external and unrelated destinations without navigating', () => {
    const assign = vi.fn();
    for (const url of ['//evil.example/new', 'https://evil.example/new', '/newness', '/playlists']) {
      expect(() => forwardToPreview(url, {assign})).toThrow();
    }
    expect(assign).not.toHaveBeenCalled();
  });
});
