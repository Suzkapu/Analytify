import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { SpotifyAuthService } from "../auth/spotify-auth.service";
import { Observable, throwError, BehaviorSubject, EMPTY, from, of } from "rxjs";
import { catchError, expand, map, mergeMap, reduce, take, toArray } from 'rxjs/operators';
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

  getUserPlaylists(limit: number = 50, offset: number = 0): Observable<any> {
    const playlistsEndpoint = `${environment.spotifyUrl}/me/playlists?limit=${limit}&offset=${offset}`;
    return this.makeRequest(() => this.http.get(playlistsEndpoint));
  }

  getAllUserPlaylists(): Observable<any> {
    return this.getUserPlaylists(50, 0).pipe(
      expand((page: any) =>
        page?.next
          ? this.makeRequest(() => this.http.get(page.next))
          : EMPTY
      ),
      reduce((combined: any, page: any) => ({
        ...page,
        items: [...combined.items, ...(page.items || [])],
        next: null
      }), { items: [] })
    );
  }

  getSinglePlaylist(playlistId: string): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}`;
    return this.makeRequest(() => this.http.get(playlistEndpoint)).pipe(
      map((playlist: any) => {
        const collection = playlist.items || playlist.tracks || { items: [], total: 0 };
        return {
          ...playlist,
          tracks: {
            ...collection,
            items: this.normalizePlaylistEntries(collection.items || [])
          }
        };
      })
    );
  }

  getAllTracksFromPlaylist(playlistId: string, offset: number, limit: number): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}/items?offset=${offset}&limit=${limit}`;
    return this.makeRequest(() => this.http.get(playlistEndpoint)).pipe(
      map((response: any) => ({
        ...response,
        items: this.normalizePlaylistEntries(response.items || [])
      }))
    );
  }

  getFavTracks(offset: number, limit: number): Observable<any> {
    const trackEndpoint = `${environment.spotifyUrl}/me/tracks?offset=${offset}&limit=${limit}`;
    return this.makeRequest(() => this.http.get(trackEndpoint));
  }

  getSingleArtist(artistId: string): Observable<any> {
    const artistEndpoint = `${environment.spotifyUrl}/artists/${artistId}?locale=en_US`;
    return this.makeRequest(() => this.http.get(artistEndpoint));
  }

  getSeveralArtists(artistIds: string[]): Observable<any> {
    const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
    if (uniqueIds.length === 0) return of({ artists: [] });

    const ids = uniqueIds.join(',');
    const artistsEndpoint = `${environment.spotifyUrl}/artists?ids=${ids}&locale=en_US`;
    return this.makeRequest(() => this.http.get(artistsEndpoint)).pipe(
      catchError(batchError => {
        if (![400, 403, 404].includes(batchError?.status)) {
          return throwError(() => batchError);
        }
        console.warn('[SpotifyDataService] Artist batch endpoint unavailable; using individual requests.', batchError);
        return from(uniqueIds).pipe(
          mergeMap(id => this.getSingleArtist(id).pipe(catchError(() => of(null))), 4),
          toArray(),
          map(artists => ({ artists: artists.filter(Boolean) }))
        );
      })
    );
  }

  getSeveralTracks(trackIds: string[]): Observable<any> {
    const uniqueIds = Array.from(new Set(trackIds.filter(Boolean)));
    if (uniqueIds.length === 0) return of({ tracks: [] });

    const ids = uniqueIds.join(',');
    const endpoint = `${environment.spotifyUrl}/tracks?ids=${ids}`;
    return this.makeRequest(() => this.http.get(endpoint)).pipe(
      catchError(batchError => {
        if (![400, 403, 404].includes(batchError?.status)) {
          return throwError(() => batchError);
        }
        console.warn('[SpotifyDataService] Track batch endpoint unavailable; using individual requests.', batchError);
        return from(uniqueIds).pipe(
          mergeMap(id => this.getSingleTrack(id).pipe(catchError(() => of(null))), 4),
          toArray(),
          map(tracks => ({ tracks: tracks.filter(Boolean) }))
        );
      })
    );
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
    const endpoint = `${environment.spotifyUrl}/me/top/artists?time_range=${timeRange}&limit=${limit}&offset=${offset}&locale=en_US`;
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
    // POST /users/{id}/playlists was removed for 2026 Development Mode apps.
    // The current-user endpoint also avoids synthetic development user IDs.
    const endpoint = `${environment.spotifyUrl}/me/playlists`;
    return this.makeRequest(() => this.http.post(endpoint, { name, description, public: true }));
  }

  addTracksToPlaylist(playlistId: string, trackUris: string[]): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/playlists/${playlistId}/items`;
    return this.makeRequest(() => this.http.post(endpoint, { uris: trackUris }));
  }

  private normalizePlaylistEntries(entries: any[]): any[] {
    return entries.map(entry => {
      if (!entry || entry.track) return entry;
      return {
        ...entry,
        track: entry.item || null
      };
    });
  }
}
