import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { SpotifyAuthService } from "../auth/spotify-auth.service";
import { Observable, throwError, BehaviorSubject } from "rxjs";
import { catchError, mergeMap, take } from 'rxjs/operators';
import {environment} from "../../../environments/environment";

@Injectable({
  providedIn: 'root'
})
export class SpotifyDataService {
  private localStorageKey = 'spotifyRetryAfter';
  private retryAfterSubject = new BehaviorSubject<number>(0);

  constructor(private http: HttpClient, private authService: SpotifyAuthService) {
    const storedRetryAfter = parseInt(localStorage.getItem(this.localStorageKey) || '0', 10);
    this.retryAfterSubject.next(storedRetryAfter);
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getAccessToken()}`,
    });
  }

  makeRequest(requestFunc: () => Observable<any>): Observable<any> {
    return this.retryAfterSubject.pipe(
      take(1),
      mergeMap(retryAfter => {
        const now = Date.now() / 1000;
        if (retryAfter > now) {
          console.log('API calls are currently in cooldown.')
          return throwError('API calls are currently in cooldown.');
        } else {
          return requestFunc().pipe(
            catchError(error => {
              if (error.status === 429 && error.headers.get('Retry-After')) {
                const retryAfter = now + parseInt(error.headers.get('Retry-After'), 10);
                this.retryAfterSubject.next(retryAfter);
                localStorage.setItem(this.localStorageKey, retryAfter.toString());
              }
              return throwError(error);
            })
          );
        }
      })
    );
  }

  getCurrentUser(): Observable<any> {
    const userEndpoint = `${environment.spotifyUrl}/me`;
    return this.http.get(userEndpoint, { headers: this.getHeaders() });
  }

  getUserPlaylists(): Observable<any> {
    const playlistsEndpoint = `${environment.spotifyUrl}/me/playlists?market=AT`;
    return this.makeRequest(() => this.http.get(playlistsEndpoint, { headers: this.getHeaders() }));
  }

  getSinglePlaylist(playlistId: string): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}?market=AT`;
    return this.http.get(playlistEndpoint, { headers: this.getHeaders() });
  }

  getAllTracksFromPlaylist(playlistId: string, offset: number, limit: number): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}&market=AT`;
    return this.makeRequest(() => this.http.get(playlistEndpoint, { headers: this.getHeaders() }));
  }

  getFavTracks(offset: number, limit: number): Observable<any> {
    const trackEndpoint = `${environment.spotifyUrl}/me/tracks?offset=${offset}&limit=${limit}`;
    return this.makeRequest(() => this.http.get(trackEndpoint, { headers: this.getHeaders() }));
  }

  getSingleArtist(artistId: string): Observable<any> {
    const artistEndpoint = `${environment.spotifyUrl}/artists/${artistId}`;
    return this.makeRequest(() => this.http.get(artistEndpoint, { headers: this.getHeaders() }));
  }

  getSingleTrack(trackId: string): Observable<any> {
    const trackEndpoint = `${environment.spotifyUrl}/tracks/${trackId}`;
    return this.makeRequest(() => this.http.get(trackEndpoint, { headers: this.getHeaders() }));
  }
}
