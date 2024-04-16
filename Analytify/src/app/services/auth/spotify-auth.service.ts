import {Injectable} from '@angular/core';
import {environment} from "../../../environments/environment";

@Injectable({
  providedIn: 'root',
})
export class SpotifyAuthService {
  private readonly storageKey = 'spotifyAccessToken';

  private clientId = 'REDACTED_SPOTIFY_CLIENT_ID';
  private redirectUri = environment.appUrl+'/callback';

  constructor() {
  }

  private get accessToken(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  getAuthorizationUrl(): string {
    const scopes = 'playlist-read-private user-library-read';

    return `${environment.authorizeUrl}?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&scope=${encodeURIComponent(
      scopes
    )}&response_type=token&show_dialog=true`;
  }

  setAccessTokenFromFragment(fragment: string): void {
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');

    if (accessToken) {
      localStorage.setItem(this.storageKey, accessToken);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }
}
