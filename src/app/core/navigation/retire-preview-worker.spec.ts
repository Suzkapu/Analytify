import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const listeners = vi.hoisted(() => {
  const callbacks: Record<string, (event: {waitUntil: (promise: Promise<unknown>) => void}) => void> = {};
  vi.stubGlobal('self', {addEventListener: (name: string, callback: typeof callbacks[string]) => {callbacks[name] = callback;}});
  return callbacks;
});
import '../../../assets/retire-preview-worker.js';
vi.unstubAllGlobals();

describe('retiring the former preview service worker', () => {
  const origin = 'https://analytify.dynv6.net';
  let unregister: ReturnType<typeof vi.fn>;
  let removeCache: ReturnType<typeof vi.fn>;
  let matchAll: ReturnType<typeof vi.fn>;
  let skipWaiting: ReturnType<typeof vi.fn>;
  let registration: {scope: string; unregister: ReturnType<typeof vi.fn>};
  beforeEach(() => {
    unregister = vi.fn().mockResolvedValue(true);
    removeCache = vi.fn().mockResolvedValue(true);
    matchAll = vi.fn().mockResolvedValue([]);
    skipWaiting = vi.fn();
    registration = {scope: origin + '/new/', unregister};
    vi.stubGlobal('self', {registration, clients: {matchAll}, location: {origin}, skipWaiting});
    vi.stubGlobal('caches', {keys: vi.fn().mockResolvedValue([
      'ngsw:/new/:db:control', 'ngsw:/new/:assets:version', 'ngsw:/:db:control', 'ngsw:/newer/:db:control', 'other-cache'
    ]), delete: removeCache});
  });
  afterEach(() => vi.unstubAllGlobals());
  function activate(): Promise<unknown> {
    let completion: Promise<unknown> | undefined;
    listeners['activate']({waitUntil: promise => {completion = promise;}});
    if (!completion) throw new Error('Worker activation must keep retirement alive.');
    return completion;
  }
  it('installs immediately so an existing preview registration can retire', () => {
    listeners['install']({waitUntil: vi.fn()});
    expect(skipWaiting).toHaveBeenCalledOnce();
  });
  it('leaves root and other scopes, their caches, and clients untouched', async () => {
    for (const scope of ['/', '/newer/']) {
      registration.scope = origin + scope;
      await activate();
    }
    expect(caches.keys).not.toHaveBeenCalled();
    expect(removeCache).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
    expect(matchAll).not.toHaveBeenCalled();
  });
  it('retires only preview caches and moves same-origin preview clients to root while preserving query and fragment', async () => {
    const preview = {url: origin + '/new/stats?range=short#history', navigate: vi.fn().mockResolvedValue(null)};
    const root = {url: origin + '/stats', navigate: vi.fn()};
    const external = {url: 'https://other.invalid/new/stats', navigate: vi.fn()};
    const similar = {url: origin + '/newer/stats', navigate: vi.fn()};
    matchAll.mockResolvedValue([preview, root, external, similar]);
    await activate();
    expect(removeCache.mock.calls).toEqual([['ngsw:/new/:db:control'], ['ngsw:/new/:assets:version']]);
    expect(unregister).toHaveBeenCalledOnce();
    expect(matchAll).toHaveBeenCalledWith({type: 'window'});
    expect(preview.navigate).toHaveBeenCalledExactlyOnceWith(origin + '/stats?range=short#history');
    for (const client of [root, external, similar]) expect(client.navigate).not.toHaveBeenCalled();
  });
  it('keeps the registration and clients unchanged if deleting preview caches fails', async () => {
    removeCache.mockRejectedValue(new Error('cache unavailable'));
    await expect(activate()).rejects.toThrow('cache unavailable');
    expect(unregister).not.toHaveBeenCalled();
    expect(matchAll).not.toHaveBeenCalled();
  });
});
