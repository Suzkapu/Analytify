import {APP_ROUTES, ROUTER_OPTIONS} from './app-routing.module';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {adminGuard} from '@core/admin/admin.guard';

describe('application routes', () => {
  it('preserves every public URL and the fallback route', () => {
    expect(APP_ROUTES.map(route => route.path)).toEqual([
      '',
      'login',
      'callback',
      'spotify',
      'playlists',
      'songs',
      'artistDetails',
      'analysis',
      'stats',
      'history',
      'admin',
      'song-league',
      'shared-playlists',
      'legal',
      'compare-room',
      '**'
    ]);
  });

  it('requires both login and administrator authorization for the admin route', () => {
    const route = APP_ROUTES.find(candidate => candidate.path === 'admin');
    expect(route?.loadChildren).toEqual(jasmine.any(Function));
    expect(route?.canActivate).toEqual([spotifyAuthGuard, adminGuard]);
  });

  it('lazy-loads and protects every authenticated feature', () => {
    const protectedPaths = [
      'playlists', 'songs', 'artistDetails', 'analysis', 'stats', 'history', 'song-league', 'shared-playlists'
    ];

    protectedPaths.forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
      expect(route?.canActivate).toContain(spotifyAuthGuard);
    });
  });

  it('uses a browser title that covers both private sharing types', () => {
    const route = APP_ROUTES.find(candidate => candidate.path === 'shared-playlists');

    expect(route?.title).toBe('Private Sharing | Analytify');
  });

  it('keeps private sharing and user stats in lazy-loaded feature modules', () => {
    const privateSharing = APP_ROUTES.find(candidate => candidate.path === 'shared-playlists');
    const userStats = APP_ROUTES.find(candidate => candidate.path === 'stats');

    expect(privateSharing?.component).toBeUndefined();
    expect(privateSharing?.loadChildren).toEqual(jasmine.any(Function));
    expect(userStats?.component).toBeUndefined();
    expect(userStats?.loadChildren).toEqual(jasmine.any(Function));
  });

  it('redirects logged-in users away from both login entry routes', () => {
    ['', 'login'].forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.canActivate).toEqual([redirectLoggedInGuard]);
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
    });
  });

  it('keeps callback, personal Spotify setup, legal, and Compare Room routes public', () => {
    ['callback', 'spotify', 'legal', 'compare-room'].forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.canActivate).toBeUndefined();
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
    });
  });

  it('restores positions and scrolls URL fragments below the sticky header', () => {
    expect(ROUTER_OPTIONS).toEqual(jasmine.objectContaining({
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled',
      scrollOffset: [0, 96]
    }));
  });
});
