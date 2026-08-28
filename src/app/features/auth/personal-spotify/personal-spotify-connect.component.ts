import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {environment} from '@env/environment';

@Component({
  selector: 'app-personal-spotify-connect',
  templateUrl: './personal-spotify-connect.component.html',
  styleUrls: ['./personal-spotify-connect.component.scss']
})
export class PersonalSpotifyConnectComponent implements OnInit {
  readonly callbackUri = environment.personalSpotifyRedirectUri;
  clientId = '';
  errorMessage = '';
  copied = false;
  connecting = false;
  returnUrl = '/playlists';

  constructor(
    public auth: SpotifyAuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.clientId = this.auth.getPersonalSpotifyClientId();
    this.returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }

  async copyCallback(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.callbackUri);
      this.copied = true;
      setTimeout(() => this.copied = false, 1800);
    } catch {
      this.errorMessage = 'Copying was blocked. Select the callback URL and copy it manually.';
    }
  }

  async connect(): Promise<void> {
    this.errorMessage = '';
    this.connecting = true;
    try {
      await this.auth.startPersonalAppAuthorization(this.clientId, this.returnUrl);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Spotify authorization could not be started.';
      this.connecting = false;
    }
  }

  cancel(): void {
    void this.router.navigateByUrl(this.auth.isAuthenticated() ? this.returnUrl : '/login');
  }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/playlists';
  }
}

