import {HttpErrorResponse, HttpHandler, HttpRequest, HttpResponse} from '@angular/common/http';
import {firstValueFrom, of, throwError} from 'rxjs';
import {SpotifyAuthInterceptor} from './spotify-auth.interceptor';
import {SpotifyAuthService} from './spotify-auth.service';

describe('SpotifyAuthInterceptor', () => {
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let interceptor: SpotifyAuthInterceptor;

  beforeEach(() => {
    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', [
      'isAuthenticated',
      'isTokenExpired',
      'getAccessToken',
      'refreshToken',
      'loginWithSupabase'
    ]);
    auth.isAuthenticated.and.returnValue(true);
    auth.isTokenExpired.and.returnValue(false);
    auth.getAccessToken.and.returnValue('cached-token');
    auth.refreshToken.and.returnValue(of({ access_token: 'refreshed-token' }));
    auth.loginWithSupabase.and.resolveTo();
    interceptor = new SpotifyAuthInterceptor(auth);
  });

  it('passes non-Spotify requests through unchanged', async () => {
    const request = new HttpRequest('GET', 'https://example.com/data');
    let received: HttpRequest<any> | undefined;
    const next = handlerFor(req => {
      received = req;
      return of(new HttpResponse({ status: 200 }));
    });

    await firstValueFrom(interceptor.intercept(request, next));

    expect(received).toBe(request);
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });

  it('adds the cached Spotify token and language preference', async () => {
    const request = new HttpRequest('GET', 'https://api.spotify.com/v1/me');
    let received: HttpRequest<any> | undefined;
    const next = handlerFor(req => {
      received = req;
      return of(new HttpResponse({ status: 200 }));
    });

    await firstValueFrom(interceptor.intercept(request, next));

    expect(received?.headers.get('Authorization')).toBe('Bearer cached-token');
    expect(received?.headers.get('Accept-Language')).toContain('en-GB');
  });

  it('refreshes once after a 401 and retries with the new token', async () => {
    const request = new HttpRequest('GET', 'https://api.spotify.com/v1/me');
    const received: HttpRequest<any>[] = [];
    const unauthorized = new HttpErrorResponse({ status: 401 });
    const next = handlerFor(req => {
      received.push(req);
      return received.length === 1
        ? throwError(() => unauthorized)
        : of(new HttpResponse({ status: 200 }));
    });

    await firstValueFrom(interceptor.intercept(request, next));

    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
    expect(received.length).toBe(2);
    expect(received[1].headers.get('Authorization')).toBe('Bearer refreshed-token');
  });

  it('refreshes an expired token before sending the request', async () => {
    auth.isTokenExpired.and.returnValue(true);
    const request = new HttpRequest('GET', 'https://api.spotify.com/v1/me');
    let received: HttpRequest<any> | undefined;
    const next = handlerFor(req => {
      received = req;
      return of(new HttpResponse({ status: 200 }));
    });

    await firstValueFrom(interceptor.intercept(request, next));

    expect(received?.headers.get('Authorization')).toBe('Bearer refreshed-token');
    expect(auth.refreshToken).toHaveBeenCalledTimes(1);
  });

  function handlerFor(
    handle: (request: HttpRequest<any>) => ReturnType<HttpHandler['handle']>
  ): HttpHandler {
    return { handle } as HttpHandler;
  }
});
