import {Injectable} from '@angular/core';
import {HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse} from '@angular/common/http';
import {Observable, throwError} from 'rxjs';
import {switchMap, catchError} from 'rxjs/operators';
import {SpotifyAuthService} from './spotify-auth.service';
import {TRANSIENT_SPOTIFY_REQUEST} from '@core/compare-room/spotify-request-context';

@Injectable()
export class SpotifyAuthInterceptor implements HttpInterceptor {
  constructor(private authService: SpotifyAuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (req.context.get(TRANSIENT_SPOTIFY_REQUEST)) {
      return next.handle(req.clone({context: req.context.delete(TRANSIENT_SPOTIFY_REQUEST)}));
    }

    // Check if the request is targeting the Spotify API
    if (req.url.startsWith('https://api.spotify.com/v1')) {
      if (this.authService.isAuthenticated()) {
        if (this.authService.isTokenExpired()) {
          // Token is expired, trigger refresh before sending the request
          return this.authService.refreshToken().pipe(
            switchMap((response: any) => {
              return this.sendSpotifyRequest(req, next, response.access_token, false);
            }),
            catchError((refreshErr) => {
              console.error('Auto token refresh failed', refreshErr);
              console.warn('Refresh token is invalid or expired. Redirecting to Spotify OAuth for renewal.');
              this.authService.loginWithSupabase(false);
              return throwError(() => refreshErr);
            })
          );
        } else {
          return this.sendSpotifyRequest(req, next, this.authService.getAccessToken() || '', true);
        }
      }
    }

    // Pass through non-Spotify or token endpoint requests normally
    return next.handle(req);
  }

  private sendSpotifyRequest(
    req: HttpRequest<any>,
    next: HttpHandler,
    accessToken: string,
    retryUnauthorized: boolean
  ): Observable<HttpEvent<any>> {
    const clonedReq = req.clone({
      headers: req.headers
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Accept-Language', 'en-GB,en-US;q=0.9,en;q=0.8')
    });

    return next.handle(clonedReq).pipe(
      catchError((err) => {
        if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
          return throwError(() => err);
        }

        if (!retryUnauthorized) {
          return throwError(() => err);
        }

        console.warn('Spotify rejected the cached token. Refreshing it once before re-authentication.');
        return this.authService.refreshToken().pipe(
          switchMap((response: any) =>
            this.sendSpotifyRequest(req, next, response.access_token, false)
          ),
          catchError(refreshErr => {
            console.warn('Spotify token refresh failed after a 401. Redirecting to Spotify OAuth.', refreshErr);
            this.authService.loginWithSupabase(false);
            return throwError(() => refreshErr);
          })
        );
      })
    );
  }
}
