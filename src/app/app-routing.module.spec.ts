import {describe, expect, it} from 'vitest';
import {APP_ROUTES, ROUTER_OPTIONS} from './app-routing.module';
import {AppShellComponent} from '@shared/layout/app-shell/app-shell.component';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {cloudIdentityGuard} from '@core/auth/cloud-identity.guard';
import {spotifyRestrictedFeatureGuard} from '@core/compliance/spotify-policy-gate';
import {adminGuard} from '@core/admin/admin.guard';

describe('stable application routes', () => {
  const shell = APP_ROUTES.find(route => route.component === AppShellComponent)!;
  const route = (path: string) => shell.children!.find(candidate => candidate.path === path)!;

  it('uses the original shell and independently lazy legacy pages', () => {
    expect(shell).toBeDefined();
    for (const path of ['playlists', 'songs', 'artistDetails', 'analysis', 'stats', 'history']) {
      expect(route(path).loadChildren).toBeTypeOf('function');
      expect(route(path).loadComponent).toBeUndefined();
      expect(route(path).canActivate).toContain(spotifyAuthGuard);
    }
    expect(APP_ROUTES.some(candidate => candidate.loadComponent)).toBe(false);
  });

  it('retains authorization and Spotify policy restrictions', () => {
    expect(route('admin').canActivate).toEqual([spotifyAuthGuard, adminGuard]);
    expect(route('song-league').canActivate).toEqual([spotifyAuthGuard, cloudIdentityGuard, spotifyRestrictedFeatureGuard]);
    expect(route('shared-playlists').canActivate).toEqual([spotifyAuthGuard, cloudIdentityGuard]);
    expect(route('stats').canActivate).toContain(spotifyRestrictedFeatureGuard);
    expect(route('history').canActivate).toContain(spotifyRestrictedFeatureGuard);
  });

  it('preserves callbacks, public links and browser behavior', () => {
    for (const path of ['callback', 'spotify', 'legal', 'compare-room', 'compare-room/join/:roomId', 'compare-room/callback']) {
      expect(APP_ROUTES.find(candidate => candidate.path === path)?.loadChildren).toBeTypeOf('function');
    }
    expect(ROUTER_OPTIONS.scrollPositionRestoration).toBe('enabled');
    expect(ROUTER_OPTIONS.enableViewTransitions).toBe(true);
  });
});
