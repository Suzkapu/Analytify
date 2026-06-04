import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {Observable, throwError, Subject} from 'rxjs';
import {tap, catchError, shareReplay} from 'rxjs/operators';
import {StorageService} from '../storage/storage.service';

@Injectable({
  providedIn: 'root',
})
export class SpotifyAuthService {
  private readonly storageKey = 'spotifyAccessToken';
  private refreshObservable: Observable<any> | null = null;
  logout$ = new Subject<void>();

  private clientId = '9b03c8eb85dd4df483c3ae097e6c39f0';
  private redirectUri = environment.appUrl + '/callback';

  constructor(private http: HttpClient, private storageService: StorageService) {
  }

  private get accessToken(): string | null {
    return this.storageService.getItem(this.storageKey);
  }

  private generateCodeVerifier(length = 64): string {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    let binary = '';
    for (let i = 0; i < array.length; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async getAuthorizationUrl(): Promise<string> {
    const verifier = this.generateCodeVerifier();
    this.storageService.setItem('spotifyCodeVerifier', verifier);

    const challenge = await this.generateCodeChallenge(verifier);
    const scopes = 'playlist-read-private user-library-read user-top-read user-read-recently-played playlist-modify-public playlist-modify-private';

    return `${environment.authorizeUrl}?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&scope=${encodeURIComponent(
      scopes
    )}&response_type=code&code_challenge_method=S256&code_challenge=${challenge}&show_dialog=true`;
  }

  exchangeCodeForToken(code: string): Observable<any> {
    const verifier = this.storageService.getItem('spotifyCodeVerifier') || '';
    const body = new HttpParams()
      .set('client_id', this.clientId)
      .set('grant_type', 'authorization_code')
      .set('code', code)
      .set('redirect_uri', this.redirectUri)
      .set('code_verifier', verifier);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    return this.http.post('https://accounts.spotify.com/api/token', body.toString(), { headers }).pipe(
      tap((response: any) => {
        if (response && response.access_token) {
          this.storageService.setItem(this.storageKey, response.access_token);
          if (response.refresh_token) {
            this.storageService.setItem('spotifyRefreshToken', response.refresh_token);
          }
          const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
          this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());
        }
      })
    );
  }

  refreshToken(): Observable<any> {
    if (this.refreshObservable) {
      return this.refreshObservable;
    }

    const refreshToken = this.storageService.getItem('spotifyRefreshToken') || '';
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token found'));
    }

    const body = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('refresh_token', refreshToken)
      .set('client_id', this.clientId);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    this.refreshObservable = this.http.post('https://accounts.spotify.com/api/token', body.toString(), { headers }).pipe(
      tap((response: any) => {
        if (response && response.access_token) {
          this.storageService.setItem(this.storageKey, response.access_token);
          if (response.refresh_token) {
            this.storageService.setItem('spotifyRefreshToken', response.refresh_token);
          }
          const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
          this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());
        }
        this.refreshObservable = null;
      }),
      catchError(err => {
        this.refreshObservable = null;
        return throwError(() => err);
      }),
      shareReplay(1)
    );

    return this.refreshObservable;
  }

  isTokenExpired(): boolean {
    const expiresAtStr = this.storageService.getItem('spotifyTokenExpiresAt');
    if (!expiresAtStr) {
      return true;
    }
    const expiresAt = parseInt(expiresAtStr, 10);
    // Refresh 1 minute before expiry
    return Date.now() > (expiresAt - 60 * 1000);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUserId(): string | null {
    return this.storageService.getItem('spotifyUserId');
  }

  setUserId(userId: string): void {
    this.storageService.setItem('spotifyUserId', userId);
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  logout(): void {
    this.storageService.removeItem(this.storageKey);
    this.storageService.removeItem('spotifyUserId');
    this.storageService.removeItem('spotifyRefreshToken');
    this.storageService.removeItem('spotifyTokenExpiresAt');
    this.clearAllCookies();
    this.logout$.next();
  }

  clearCacheAndLogout(): void {
    this.storageService.clear();
    this.storageService.clearAllHistory(); // also wipe IndexedDB stats history
    this.clearAllCookies();
    this.logout$.next();
  }

  private clearAllCookies(): void {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname;
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + window.location.hostname.replace(/^www\./, '');
    }
  }
}

