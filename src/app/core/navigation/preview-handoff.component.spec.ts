import {describe, expect, it, vi} from 'vitest';
import {forwardToPreview, previewCallbackDestination} from './preview-handoff.component';

describe('preview document handoff', () => {
  it('forwards preview callbacks before consuming their stored authorization requests', () => {
    for (const path of ['/callback', '/spotify/callback', '/compare-room/callback']) {
      const stored = path === '/callback' ? '/new/stats' : JSON.stringify({returnUrl: '/new/compare-room/join/room'});
      const getItem = vi.fn().mockReturnValue(stored);
      expect(previewCallbackDestination(`${path}?code=test&state=test#fragment`, {getItem}))
        .toBe(`/new${path}?code=test&state=test#fragment`);
    }
  });

  it('leaves stable callbacks and malformed or unrelated requests untouched', () => {
    for (const stored of [null, '/stats', 'broken json', JSON.stringify({returnUrl: '//evil.example/new'})]) {
      expect(previewCallbackDestination('/spotify/callback?code=test', {getItem: () => stored})).toBeNull();
    }
    expect(previewCallbackDestination('//evil.example/callback', {getItem: () => '/new/stats'})).toBeNull();
  });
  it('does not reload a stable fallback document already inside the preview mount', () => {
    const assign = vi.fn();
    for (const path of ['/new', '/new/', '/new/stats']) {
      expect(forwardToPreview('/new/stats', {assign}, path)).toBe(false);
    }
    expect(assign).not.toHaveBeenCalled();
  });
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
