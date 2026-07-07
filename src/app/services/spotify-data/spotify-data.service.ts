import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { SpotifyAuthService } from "../auth/spotify-auth.service";
import { Observable, throwError, BehaviorSubject } from "rxjs";
import { catchError, mergeMap, take } from 'rxjs/operators';
import {environment} from "../../../environments/environment";
import {StorageService} from "../storage/storage.service";

@Injectable({
  providedIn: 'root'
})
export class SpotifyDataService {
  private localStorageKey = 'spotifyRetryAfter';
  private retryAfterSubject = new BehaviorSubject<number>(0);

  constructor(
    private http: HttpClient, 
    private authService: SpotifyAuthService,
    private storageService: StorageService
  ) {
    const storedRetryAfter = parseInt(this.storageService.getItem(this.localStorageKey) || '0', 10);
    this.retryAfterSubject.next(storedRetryAfter);
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
                this.storageService.setItem(this.localStorageKey, retryAfter.toString());
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
    return this.makeRequest(() => this.http.get(userEndpoint));
  }

  getUserPlaylists(): Observable<any> {
    const playlistsEndpoint = `${environment.spotifyUrl}/me/playlists`;
    return this.makeRequest(() => this.http.get(playlistsEndpoint));
  }

  getSinglePlaylist(playlistId: string): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}`;
    return this.http.get(playlistEndpoint);
  }

  getAllTracksFromPlaylist(playlistId: string, offset: number, limit: number): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}/items?offset=${offset}&limit=${limit}`;
    return this.makeRequest(() => this.http.get(playlistEndpoint));
  }

  getFavTracks(offset: number, limit: number): Observable<any> {
    const trackEndpoint = `${environment.spotifyUrl}/me/tracks?offset=${offset}&limit=${limit}`;
    return this.makeRequest(() => this.http.get(trackEndpoint));
  }

  getSingleArtist(artistId: string): Observable<any> {
    const artistEndpoint = `${environment.spotifyUrl}/artists/${artistId}`;
    return this.makeRequest(() => this.http.get(artistEndpoint));
  }

  getSeveralArtists(artistIds: string[]): Observable<any> {
    const ids = artistIds.join(',');
    const artistsEndpoint = `${environment.spotifyUrl}/artists?ids=${ids}`;
    return this.makeRequest(() => this.http.get(artistsEndpoint));
  }

  getSeveralTracks(trackIds: string[]): Observable<any> {
    const ids = trackIds.join(',');
    const endpoint = `${environment.spotifyUrl}/tracks?ids=${ids}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  getSingleTrack(trackId: string): Observable<any> {
    const trackEndpoint = `${environment.spotifyUrl}/tracks/${trackId}`;
    return this.makeRequest(() => this.http.get(trackEndpoint));
  }

  getSeveralAudioFeatures(trackIds: string[]): Observable<any> {
    const ids = trackIds.join(',');
    const endpoint = `${environment.spotifyUrl}/audio-features?ids=${ids}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  getUserTopArtists(timeRange: string, limit: number, offset: number): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/me/top/artists?time_range=${timeRange}&limit=${limit}&offset=${offset}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  getUserTopTracks(timeRange: string, limit: number, offset: number): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/me/top/tracks?time_range=${timeRange}&limit=${limit}&offset=${offset}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  getRecentlyPlayed(limit: number = 50): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/me/player/recently-played?limit=${limit}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  createPlaylist(userId: string, name: string, description: string = ''): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/users/${userId}/playlists`;
    return this.makeRequest(() => this.http.post(endpoint, { name, description, public: true }));
  }

  addTracksToPlaylist(playlistId: string, trackUris: string[]): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/playlists/${playlistId}/tracks`;
    return this.makeRequest(() => this.http.post(endpoint, { uris: trackUris }));
  }
}
