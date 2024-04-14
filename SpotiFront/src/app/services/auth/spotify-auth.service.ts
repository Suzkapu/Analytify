import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SpotifyAuthService {
  private readonly storageKey = 'spotifyAccessToken';

  private clientId = '69e52621c3b248a5b299dc86ddc14160';
  private redirectUri = 'http://localhost:4200/callback';
  private authEndpoint = 'https://accounts.spotify.com/authorize';

  constructor() {
  }

  private get accessToken(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  getAuthorizationUrl(): string {
    const scopes = 'playlist-read-private user-library-read';

    return `${this.authEndpoint}?client_id=${this.clientId}&redirect_uri=${this.redirectUri}&scope=${encodeURIComponent(
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
