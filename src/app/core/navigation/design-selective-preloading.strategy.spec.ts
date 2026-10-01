import {of} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {DesignSelectivePreloadingStrategy} from './design-selective-preloading.strategy';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';

describe('DesignSelectivePreloadingStrategy', () => {
  const strategy = new DesignSelectivePreloadingStrategy({isAuthenticated: () => true} as SpotifyAuthService);

  it('does not download authenticated destinations while signed out', () => {
    const signedOut = new DesignSelectivePreloadingStrategy({isAuthenticated: () => false} as SpotifyAuthService);
    const load = vi.fn(() => of('loaded'));
    signedOut.preload({path: 'stats', data: {preload: true}}, load).subscribe();
    expect(load).not.toHaveBeenCalled();
  });

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
