import {APP_ROUTES, ROUTER_OPTIONS} from './app-routing.module';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {adminGuard} from '@core/admin/admin.guard';
import {AppShellComponent} from '@shared/layout/app-shell/app-shell.component';

describe('application routes', () => {
  const shell = APP_ROUTES.find(route => route.component === AppShellComponent)!;
  const routeByPath = (path: string) => shell.children?.find(route => route.path === path)
    ?? APP_ROUTES.find(route => route.path === path);

  it('preserves every public URL and the fallback route', () => {
    const publicPaths = APP_ROUTES.map(route => route.path);
    expect(publicPaths).toContain('login');
    expect(publicPaths).toContain('compare-room/callback');
    expect(publicPaths).toContain('compare-room/join/:roomId');
    expect(publicPaths).toContain('compare-room');
    expect(publicPaths).toContain('**');
    expect(shell.children?.map(route => route.path)).toEqual([
      'playlists', 'songs', 'artistDetails', 'analysis', 'stats', 'history',
      'admin', 'song-league', 'shared-playlists'
    ]);
  });

  it('keeps authenticated pages beneath one persistent layout shell', () => {
    expect(shell.children?.length).toBe(9);
    expect(shell.loadChildren).toBeUndefined();
  });

  it('requires both login and administrator authorization for the admin route', () => {
    const route = routeByPath('admin');
    expect(route?.loadChildren).toEqual(jasmine.any(Function));
    expect(route?.canActivate).toEqual([spotifyAuthGuard, adminGuard]);
  });

  it('lazy-loads and protects every authenticated feature', () => {
    const protectedPaths = [
      'playlists', 'songs', 'artistDetails', 'analysis', 'stats', 'history', 'song-league', 'shared-playlists'
    ];

    protectedPaths.forEach(path => {
      const route = routeByPath(path);
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
      expect(route?.canActivate).toContain(spotifyAuthGuard);
    });
  });

  it('uses a browser title that covers both private sharing types', () => {
    const route = routeByPath('shared-playlists');

    expect(route?.title).toBe('Private Sharing | Analytify');
  });

  it('keeps private sharing and user stats in lazy-loaded feature modules', () => {
    const privateSharing = routeByPath('shared-playlists');
    const userStats = routeByPath('stats');

    expect(privateSharing?.component).toBeUndefined();
    expect(privateSharing?.loadChildren).toEqual(jasmine.any(Function));
    expect(userStats?.component).toBeUndefined();
    expect(userStats?.loadChildren).toEqual(jasmine.any(Function));
  });

  it('does not turn database-only private sharing access into a Cloud Backup opt-in', () => {
    const privateSharing = routeByPath('shared-playlists');

    expect(privateSharing?.data?.['cloudBackup']).toBeFalse();
  });

  it('redirects logged-in users away from both login entry routes', () => {
    ['', 'login'].forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.canActivate).toEqual([redirectLoggedInGuard]);
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
    });
  });

  it('keeps callback, personal Spotify setup, legal, and Compare Room routes public', () => {
    ['callback', 'spotify', 'legal', 'compare-room', 'compare-room/callback', 'compare-room/join/:roomId'].forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.canActivate).toBeUndefined();
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
    });
  });

  it('loads Compare Room host, guest join, and callback as independent route chunks', () => {
    const routes = ['compare-room', 'compare-room/join/:roomId', 'compare-room/callback']
      .map(path => APP_ROUTES.find(route => route.path === path));

    expect(routes.every(route => typeof route?.loadChildren === 'function')).toBeTrue();
    expect(new Set(routes.map(route => route?.loadChildren)).size).toBe(3);
  });

  it('restores positions and scrolls URL fragments below the sticky header', () => {
    expect(ROUTER_OPTIONS).toEqual(jasmine.objectContaining({
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled',
      scrollOffset: [0, 96]
    }));
  });
});
