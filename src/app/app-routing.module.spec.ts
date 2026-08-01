import {APP_ROUTES} from './app-routing.module';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';

describe('application routes', () => {
  it('preserves every public URL and the fallback route', () => {
    expect(APP_ROUTES.map(route => route.path)).toEqual([
      '',
      'login',
      'callback',
      'playlists',
      'songs',
      'artistDetails',
      'analysis',
      'stats',
      'history',
      'legal',
      'compare-room',
      '**'
    ]);
  });

  it('lazy-loads and protects every authenticated feature', () => {
    const protectedPaths = ['playlists', 'songs', 'artistDetails', 'analysis', 'stats', 'history'];

    protectedPaths.forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
      expect(route?.canActivate).toEqual([spotifyAuthGuard]);
    });
  });

  it('redirects logged-in users away from both login entry routes', () => {
    ['', 'login'].forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.canActivate).toEqual([redirectLoggedInGuard]);
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
    });
  });

  it('keeps callback, legal, and Compare Room routes public', () => {
    ['callback', 'legal', 'compare-room'].forEach(path => {
      const route = APP_ROUTES.find(candidate => candidate.path === path);
      expect(route?.canActivate).toBeUndefined();
      expect(route?.loadChildren).toEqual(jasmine.any(Function));
    });
  });
});
