import {Component, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {environment} from '@env/environment';
import {TermsAcceptanceService} from '@core/legal/terms-acceptance.service';

@Component({
    selector: 'app-personal-spotify-connect',
    templateUrl: './personal-spotify-connect.component.html',
    styleUrls: ['./personal-spotify-connect.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PersonalSpotifyConnectComponent implements OnInit {
  readonly callbackUri = environment.personalSpotifyRedirectUri;
  clientId = '';
  errorMessage = '';
  copied = false;
  connecting = false;
  returnUrl = '/playlists';
  termsAccepted = false;

  constructor(
    public auth: SpotifyAuthService,
    private route: ActivatedRoute,
    private router: Router,
    private terms: TermsAcceptanceService
  ) {}

  ngOnInit(): void {
    this.clientId = this.auth.getPersonalSpotifyClientId();
    this.returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
    this.termsAccepted = this.terms.hasCurrentAcceptance();
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
      if (!this.termsAccepted) throw new Error('Accept the Terms and Privacy Notice before connecting Spotify.');
      this.terms.acceptCurrent();
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
