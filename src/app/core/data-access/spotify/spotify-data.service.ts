import { Injectable } from '@angular/core';
import { HttpClient } from "@angular/common/http";
import { SpotifyAuthService } from "@core/auth/spotify-auth.service";
import { Observable, throwError, BehaviorSubject, EMPTY, from, of, forkJoin, defer, timer } from "rxjs";
import { catchError, concatMap, expand, map, mergeMap, reduce, take, toArray } from 'rxjs/operators';
import {environment} from "@env/environment";
import {StorageService} from "@core/data-access/storage/storage.service";

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
    return defer(() => this.waitForCooldown().pipe(
      mergeMap(() => this.executeRequest(requestFunc, 0))
    ));
  }

  private waitForCooldown(): Observable<number> {
    return this.retryAfterSubject.pipe(
      take(1),
      mergeMap(retryAfter => {
        const waitMs = Math.max(0, retryAfter * 1000 - Date.now());
        if (waitMs > 0) {
          console.log(`[SpotifyDataService] Rate-limit cooldown active; retrying in ${Math.ceil(waitMs / 1000)}s.`);
        }
        return timer(waitMs);
      })
    );
  }

  private executeRequest(requestFunc: () => Observable<any>, retryCount: number): Observable<any> {
    return requestFunc().pipe(
      catchError(error => {
        const isQuotaExceeded = error?.error?.reason === 'QUOTA_EXCEEDED'
          || error?.error?.error?.reason === 'QUOTA_EXCEEDED';
        if (error.status !== 429 || isQuotaExceeded || retryCount >= 3) {
          return throwError(() => error);
        }

        const retryAfterSeconds = Math.max(
          1,
          parseInt(error.headers?.get('Retry-After') || '5', 10) || 5
        );
        const retryAfter = Math.ceil(Date.now() / 1000 + retryAfterSeconds);
        this.retryAfterSubject.next(retryAfter);
        this.storageService.setItem(this.localStorageKey, retryAfter.toString());

        console.warn(`[SpotifyDataService] Spotify returned 429; retrying in ${retryAfterSeconds}s.`);
        return timer(retryAfterSeconds * 1000).pipe(
          mergeMap(() => this.waitForCooldown()),
          mergeMap(() => this.executeRequest(requestFunc, retryCount + 1))
        );
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

  getAccessibleUserPlaylists(knownUserId?: string, includeSaved: boolean = false): Observable<any> {
    return forkJoin({
      // The app already persists the Spotify profile ID. Reusing it removes
      // one /me request from every playlist-page refresh after first login.
      user: knownUserId ? of({id: knownUserId}) : this.getCurrentUser(),
      playlists: this.getAllUserPlaylists()
    }).pipe(
      map(({ user, playlists }) => ({
        ...playlists,
        currentUserId: user?.id || null,
        items: includeSaved
          ? (playlists.items || [])
          : (playlists.items || []).filter((playlist: any) =>
              playlist?.owner?.id === user?.id || playlist?.collaborative === true
            )
      }))
    );
  }

  getSinglePlaylist(playlistId: string): Observable<any> {
    const playlistEndpoint = `${environment.spotifyUrl}/playlists/${playlistId}`;
    return this.makeRequest(() => this.http.get(playlistEndpoint)).pipe(
      map((playlist: any) => {
        const collection = playlist.items || { items: [], total: 0 };
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
    const artistEndpoint = `${environment.spotifyUrl}/artists/${artistId}`;
    return this.makeRequest(() => this.http.get(artistEndpoint));
  }

  getArtistsByIds(artistIds: string[]): Observable<any> {
    const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
    if (uniqueIds.length === 0) return of({ artists: [] });

    return from(uniqueIds).pipe(
      concatMap((id, index) => timer(index === 0 ? 0 : 500).pipe(
        mergeMap(() => this.getSingleArtist(id)),
        catchError(() => of(null))
      )),
      toArray(),
      map(artists => ({ artists: artists.filter(Boolean) }))
    );
  }

  getTracksByIds(trackIds: string[]): Observable<any> {
    const uniqueIds = Array.from(new Set(trackIds.filter(Boolean)));
    if (uniqueIds.length === 0) return of({ tracks: [] });

    return from(uniqueIds).pipe(
      mergeMap(id => this.getSingleTrack(id).pipe(catchError(() => of(null))), 4),
      toArray(),
      map(tracks => ({ tracks: tracks.filter(Boolean) }))
    );
  }

  getSingleTrack(trackId: string): Observable<any> {
    const trackEndpoint = `${environment.spotifyUrl}/tracks/${trackId}`;
    return this.makeRequest(() => this.http.get(trackEndpoint));
  }

  getUserTopArtists(timeRange: string, limit: number, offset: number): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/me/top/artists?time_range=${timeRange}&limit=${limit}&offset=${offset}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  getUserTopTracks(timeRange: string, limit: number, offset: number): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/me/top/tracks?time_range=${timeRange}&limit=${limit}&offset=${offset}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  getRecentlyPlayed(limit: number = 50, after?: number): Observable<any> {
    const cursor = Number.isFinite(after) ? `&after=${after}` : '';
    const endpoint = `${environment.spotifyUrl}/me/player/recently-played?limit=${limit}${cursor}`;
    return this.makeRequest(() => this.http.get(endpoint));
  }

  createPlaylist(name: string, description: string = ''): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/me/playlists`;
    return this.makeRequest(() => this.http.post(endpoint, { name, description, public: true }));
  }

  addTracksToPlaylist(playlistId: string, trackUris: string[]): Observable<any> {
    const endpoint = `${environment.spotifyUrl}/playlists/${playlistId}/items`;
    return this.makeRequest(() => this.http.post(endpoint, { uris: trackUris }));
  }

  private normalizePlaylistEntries(entries: any[]): any[] {
    return entries.map(entry => ({
      ...entry,
      track: entry?.item || null
    }));
  }
}
