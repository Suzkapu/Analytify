import {TestBed} from '@angular/core/testing';
import {Router, UrlSegment} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';

import {
  APP_ROUTES,
  NEW_COMPATIBILITY_MATCHER,
  redirectLegacyDesignV2Url,
  ROUTER_OPTIONS
} from './app-routing.module';
import {DESIGN_V2_ROUTES} from './design-v2-routing.module';
import {adminGuard} from '@core/admin/admin.guard';
import {cloudIdentityGuard} from '@core/auth/cloud-identity.guard';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {spotifyRestrictedFeatureGuard} from '@core/compliance/spotify-policy-gate';
import {DesignSelectivePreloadingStrategy} from '@core/navigation/design-selective-preloading.strategy';
import {DesignV2ShellComponent} from '@shared/layout/design-v2-shell/design-v2-shell.component';

describe('canonical application routes', () => {
  const shell = DESIGN_V2_ROUTES[0];
  const routeByPath = (path: string) => shell.children?.find(route => route.path === path);

  it('mounts only the Design v2 route tree at the canonical root', () => {
    expect(APP_ROUTES).toHaveLength(2);
    expect(APP_ROUTES[0].matcher).toBe(NEW_COMPATIBILITY_MATCHER);
    expect(APP_ROUTES[1]).toEqual(expect.objectContaining({path: '', loadChildren: expect.any(Function)}));
    expect(shell.component).toBe(DesignV2ShellComponent);
    expect(shell.providers).toBeUndefined();
  });

  it('keeps every product and public route in the canonical shell', () => {
    expect(shell.children?.map(route => route.path)).toEqual([
      '', 'login', 'callback', 'spotify', 'playlists', 'songs/:id', 'artistDetails/:id',
      'analysis/:id', 'stats/:userId', 'stats', 'history', 'admin', 'song-league', 'shared-playlists',
      'legal', 'compare-room/callback', 'compare-room/join/:roomId', 'compare-room', '**'
    ]);
    for (const route of shell.children?.filter(candidate => candidate.loadChildren || candidate.loadComponent) ?? []) {
      expect(route.title).toEqual(expect.any(String));
      expect(route.data).toEqual(expect.objectContaining({
        pageId: expect.any(String), mobileTitle: expect.any(String),
        pageWidth: expect.stringMatching(/^(reading|form|default|dashboard|wide|full)$/),
        ambientKey: expect.any(String), preload: expect.any(Boolean)
      }));
    }
  });

  it('redirects the complete /new compatibility path while preserving query and fragment', () => {
    const segments = ['new', 'song-league', 'join', 'secret'].map(path => new UrlSegment(path, {}));
    expect(NEW_COMPATIBILITY_MATCHER(segments, {} as never, {} as never)?.consumed).toEqual(segments);
    expect(NEW_COMPATIBILITY_MATCHER([new UrlSegment('newness', {})], {} as never, {} as never)).toBeNull();

    const createUrlTree = vi.fn().mockReturnValue({canonical: true});
    TestBed.configureTestingModule({providers: [{provide: Router, useValue: {createUrlTree}}]});
    const result = TestBed.runInInjectionContext(() => redirectLegacyDesignV2Url({
      url: segments,
      queryParams: {source: 'invite'},
      fragment: 'details'
    } as never));

    expect(result).toEqual({canonical: true});
    expect(createUrlTree).toHaveBeenCalledWith(['/', 'song-league', 'join', 'secret'], {
      queryParams: {source: 'invite'}, fragment: 'details'
    });
  });

  it('keeps library pages independently lazy and preloads likely next destinations only', () => {
    const library = ['playlists', 'songs/:id', 'artistDetails/:id', 'analysis/:id'].map(routeByPath);
    expect(library.every(route => typeof route?.loadComponent === 'function')).toBe(true);
    expect(new Set(library.map(route => route?.loadComponent)).size).toBe(4);
    expect(shell.children?.filter(route => route.data?.['preload']).map(route => route.path))
      .toEqual(['playlists', 'stats', 'history']);
  });

  it('preserves authentication, cloud-identity, admin, and Spotify policy guards', () => {
    expect(routeByPath('login')?.canActivate).toEqual([redirectLoggedInGuard]);
    expect(routeByPath('admin')?.canActivate).toEqual([spotifyAuthGuard, adminGuard]);
    expect(routeByPath('song-league')?.canActivate)
      .toEqual([spotifyAuthGuard, cloudIdentityGuard, spotifyRestrictedFeatureGuard]);
    expect(routeByPath('shared-playlists')?.canActivate).toEqual([spotifyAuthGuard, cloudIdentityGuard]);
    for (const path of ['stats', 'history', 'compare-room', 'compare-room/callback', 'compare-room/join/:roomId']) {
      expect(routeByPath(path)?.canActivate).toContain(spotifyRestrictedFeatureGuard);
    }
  });

  it('keeps stable external links and browser routing behavior', () => {
    expect(routeByPath('shared-playlists')?.title).toBe('Private Sharing | Analytify');
    expect(routeByPath('shared-playlists')?.data?.['cloudBackup']).toBe(false);
    expect(routeByPath('compare-room')?.loadChildren).not.toBe(routeByPath('compare-room/join/:roomId')?.loadChildren);
    expect(ROUTER_OPTIONS).toEqual(expect.objectContaining({
      preloadingStrategy: DesignSelectivePreloadingStrategy,
      scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled',
      scrollOffset: [0, 96], enableViewTransitions: true
    }));
  });
});
