import {Injectable} from '@angular/core';
import {PreloadingStrategy, Route} from '@angular/router';
import {Observable, of} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';

@Injectable({providedIn: 'root'})
export class DesignSelectivePreloadingStrategy implements PreloadingStrategy {
  constructor(private readonly auth: SpotifyAuthService) {}

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] === true && this.auth.isAuthenticated() ? load() : of(null);
  }
}
