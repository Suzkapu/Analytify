import {of} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {DesignSelectivePreloadingStrategy} from './design-selective-preloading.strategy';

describe('DesignSelectivePreloadingStrategy', () => {
  const strategy = new DesignSelectivePreloadingStrategy();

  it('loads only routes explicitly marked as likely next destinations', () => {
    const load = vi.fn(() => of('loaded'));
    strategy.preload({path: 'stats', data: {preload: true}}, load).subscribe();
    expect(load).toHaveBeenCalledOnce();
  });

  it('does not turn the route tree into PreloadAllModules', () => {
    const load = vi.fn(() => of('loaded'));
    let result: unknown = 'pending';
    strategy.preload({path: 'admin'}, load).subscribe(value => result = value);
    expect(load).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
