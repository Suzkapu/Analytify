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
                headers: req.headers.set('Authorization', `Bearer ${response.access_token}`)
              });
              return next.handle(clonedReq).pipe(
                catchError((err) => {
                  if (err instanceof HttpErrorResponse && err.status === 401) {
                    console.warn('Received 401 from Spotify API. Invalid token. Logging out.');
                    this.authService.logout();
                    this.router.navigate(['/login']);
                  }
                  return throwError(() => err);
                })
              );
            }),
            catchError((refreshErr) => {
              console.error('Auto token refresh failed', refreshErr);
              // Clear auth so user is forced to re-login if refresh fails
              this.authService.logout();
              this.router.navigate(['/login']);
              return throwError(() => refreshErr);
            })
          );
        } else {
          // Token is valid, attach it to headers
          const clonedReq = req.clone({
            headers: req.headers.set('Authorization', `Bearer ${this.authService.getAccessToken()}`)
          });
          return next.handle(clonedReq).pipe(
            catchError((err) => {
              if (err instanceof HttpErrorResponse && err.status === 401) {
                console.warn('Received 401 from Spotify API. Invalid token. Logging out.');
                this.authService.logout();
                this.router.navigate(['/login']);
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
