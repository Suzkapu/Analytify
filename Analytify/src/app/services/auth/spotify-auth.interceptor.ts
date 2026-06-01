import {Injectable} from '@angular/core';
import {HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse} from '@angular/common/http';
import {Observable, throwError} from 'rxjs';
import {switchMap, catchError} from 'rxjs/operators';
import {SpotifyAuthService} from './spotify-auth.service';

@Injectable()
export class SpotifyAuthInterceptor implements HttpInterceptor {
  constructor(private authService: SpotifyAuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Check if the request is targeting the Spotify API
    if (req.url.startsWith('https://api.spotify.com/v1')) {
      if (this.authService.isAuthenticated()) {
        if (this.authService.isTokenExpired()) {
          // Token is expired, trigger refresh before sending the request
          return this.authService.refreshToken().pipe(
            switchMap((response: any) => {
              const clonedReq = req.clone({
                headers: req.headers.set('Authorization', `Bearer ${response.access_token}`)
              });
              return next.handle(clonedReq);
            }),
            catchError((refreshErr) => {
              console.error('Auto token refresh failed', refreshErr);
              // Clear auth so user is forced to re-login if refresh fails
              localStorage.removeItem('spotifyAccessToken');
              localStorage.removeItem('spotifyRefreshToken');
              localStorage.removeItem('spotifyTokenExpiresAt');
              return throwError(() => refreshErr);
            })
          );
        } else {
          // Token is valid, attach it to headers
          const clonedReq = req.clone({
            headers: req.headers.set('Authorization', `Bearer ${this.authService.getAccessToken()}`)
          });
          return next.handle(clonedReq);
        }
      }
    }

    // Pass through non-Spotify or token endpoint requests normally
    return next.handle(req);
  }
}
