import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {environment} from '@env/environment';
import {CompareRoomAuthRequest, SpotifyTransientSession} from './compare-room.models';
import {firstValueFrom} from 'rxjs';

@Injectable({providedIn: 'root'})
export class TransientParticipantAuthService {
  private readonly requestKey = 'analytify_compare_auth_request';
  private session: SpotifyTransientSession | null = null;

  constructor(private http: HttpClient) {}

  hasSession(): boolean {
    return !!this.session;
  }

  async getAccessToken(): Promise<string> {
    if (!this.session) {
      throw new Error('This temporary Spotify session is no longer available. Please scan the invitation again.');
    }

    if (Date.now() < this.session.expiresAt - 60_000) {
      return this.session.accessToken;
    }

    if (!this.session.refreshToken) {
      throw new Error('The temporary Spotify session expired. Please reconnect.');
    }

    const body = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('refresh_token', this.session.refreshToken)
      .set('client_id', this.spotifyClientId());
    const response = await firstValueFrom(this.http.post<any>(
      'https://accounts.spotify.com/api/token',
      body.toString(),
      {headers: new HttpHeaders({'Content-Type': 'application/x-www-form-urlencoded'})}
    ));
    this.session = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || this.session.refreshToken,
      expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
      scope: response.scope || this.session.scope
    };
    return this.session.accessToken;
  }

  async startAuthorization(returnUrl: string): Promise<void> {
    const clientId = this.spotifyClientId();
    const verifier = this.randomUrlSafeString(64);
    const challenge = await this.createChallenge(verifier);
    const request: CompareRoomAuthRequest = {
      state: this.randomUrlSafeString(32),
      verifier,
      returnUrl,
      createdAt: Date.now()
    };
    sessionStorage.setItem(this.requestKey, JSON.stringify(request));

    const scopes = [
      'user-read-private',
      'user-library-read',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-private'
    ].join(' ');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: environment.compareRoomRedirectUri,
      scope: scopes,
      state: request.state,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      show_dialog: 'true'
    });
    window.location.assign(`${environment.authorizeUrl}?${params.toString()}`);
  }

  async handleCallback(code: string, state: string): Promise<string> {
    const rawRequest = sessionStorage.getItem(this.requestKey);
    if (!rawRequest) {
      throw new Error('The Compare Room authorization request is missing or expired.');
    }

    const request = JSON.parse(rawRequest) as CompareRoomAuthRequest;
    sessionStorage.removeItem(this.requestKey);
    if (request.state !== state) {
      throw new Error('Spotify returned an invalid authorization state.');
    }
    if (Date.now() - request.createdAt > 10 * 60_000) {
      throw new Error('The Compare Room authorization request expired.');
    }

    const body = new HttpParams()
      .set('client_id', this.spotifyClientId())
      .set('grant_type', 'authorization_code')
      .set('code', code)
      .set('redirect_uri', environment.compareRoomRedirectUri)
      .set('code_verifier', request.verifier);
    const response = await firstValueFrom(this.http.post<any>(
      'https://accounts.spotify.com/api/token',
      body.toString(),
      {headers: new HttpHeaders({'Content-Type': 'application/x-www-form-urlencoded'})}
    ));
    if (!response?.access_token) {
      throw new Error('Spotify did not return an access token.');
    }
    this.session = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || null,
      expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
      scope: response.scope || ''
    };
    return request.returnUrl;
  }

  clear(): void {
    this.session = null;
    sessionStorage.removeItem(this.requestKey);
  }

  private spotifyClientId(): string {
    const clientId = environment.spotifyClientId.trim();
    if (!/^[a-zA-Z0-9]{32}$/.test(clientId)) {
      throw new Error('Compare Room Spotify login is not configured. Please contact the host.');
    }
    return clientId;
  }

  private randomUrlSafeString(byteCount: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    return this.base64Url(bytes);
  }

  private async createChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return this.base64Url(new Uint8Array(digest));
  }

  private base64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
}
