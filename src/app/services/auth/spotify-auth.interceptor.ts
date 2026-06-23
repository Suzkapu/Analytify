import {Injectable} from '@angular/core';
import {HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse} from '@angular/common/http';
import {Observable, throwError} from 'rxjs';
import {switchMap, catchError} from 'rxjs/operators';
import {SpotifyAuthService} from './spotify-auth.service';
import {Router} from '@angular/router';

@Injectable()
export class SpotifyAuthInterceptor implements HttpInterceptor {
  constructor(private authService: SpotifyAuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Check if the request is targeting the Spotify API
    if (req.url.startsWith('https://api.spotify.com/v1')) {
      if (this.authService.isAuthenticated()) {
        if (this.authService.isTokenExpired()) {
          // Token is expired, trigger refresh before sending the request
          return this.authService.refreshToken().pipe(
            switchMap((response: any) => {
              const clonedReq = req.clone({
                headers: req.headers
                  .set('Authorization', `Bearer ${response.access_token}`)
                  .set('Accept-Language', 'en-GB,en-US;q=0.9,en;q=0.8')
              });
              return next.handle(clonedReq).pipe(
                catchError((err) => {
                  if (err instanceof HttpErrorResponse && err.status === 401) {
                    console.warn('Received 401 from Spotify API. Invalid token. Redirecting to Spotify OAuth.');
                    this.authService.loginWithSupabase(false);
                  }
                  return throwError(() => err);
                })
              );
            }),
            catchError((refreshErr) => {
              console.error('Auto token refresh failed', refreshErr);
              console.warn('Refresh token is invalid or expired. Redirecting to Spotify OAuth for renewal.');
              this.authService.loginWithSupabase(false);
              return throwError(() => refreshErr);
            })
          );
        } else {
          // Token is valid, attach it to headers
          const clonedReq = req.clone({
            headers: req.headers
              .set('Authorization', `Bearer ${this.authService.getAccessToken()}`)
              .set('Accept-Language', 'en-GB,en-US;q=0.9,en;q=0.8')
          });
          return next.handle(clonedReq).pipe(
            catchError((err) => {
              if (err instanceof HttpErrorResponse && err.status === 401) {
                console.warn('Received 401 from Spotify API. Invalid token. Redirecting to Spotify OAuth.');
                this.authService.loginWithSupabase(false);
              }
              return throwError(() => err);
            })
          );
        }
      }
    }

    // Pass through non-Spotify or token endpoint requests normally
    return next.handle(req);
  }
}
