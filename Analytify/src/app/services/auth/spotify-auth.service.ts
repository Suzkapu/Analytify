import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {Observable} from 'rxjs';
import {tap} from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class SpotifyAuthService {
  private readonly storageKey = 'spotifyAccessToken';

  private clientId = '9b03c8eb85dd4df483c3ae097e6c39f0';
  private redirectUri = environment.appUrl + '/callback';

  constructor(private http: HttpClient) {
  }

  private get accessToken(): string | null {
    return localStorage.getItem(this.storageKey);
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
    localStorage.setItem('spotifyCodeVerifier', verifier);

    const challenge = await this.generateCodeChallenge(verifier);
    const scopes = 'playlist-read-private user-library-read';

    return `${environment.authorizeUrl}?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&scope=${encodeURIComponent(
      scopes
    )}&response_type=code&code_challenge_method=S256&code_challenge=${challenge}&show_dialog=true`;
  }

  exchangeCodeForToken(code: string): Observable<any> {
    const verifier = localStorage.getItem('spotifyCodeVerifier') || '';
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
          localStorage.setItem(this.storageKey, response.access_token);
        }
      })
    );
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUserId(): string | null {
    return localStorage.getItem('spotifyUserId');
  }

  setUserId(userId: string): void {
    localStorage.setItem('spotifyUserId', userId);
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}

