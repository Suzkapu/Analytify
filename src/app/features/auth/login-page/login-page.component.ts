import {Component, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {Router} from '@angular/router';
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {AuthReturnUrlService} from '@core/auth/auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {CURRENT_TERMS_VERSION, TermsAcceptanceService} from '@core/legal/terms-acceptance.service';

const console = createScopedLogger('Login');

@Component({
    selector: 'app-login-page',
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LoginPageComponent implements OnInit {
  readonly termsVersion = CURRENT_TERMS_VERSION;
  termsAccepted = false;
  errorMessage = '';

  constructor(
    private authService: SpotifyAuthService,
    private storageService: StorageService,
    private router: Router,
    private returnUrl: AuthReturnUrlService,
    private terms: TermsAcceptanceService
  ) {
  }

  async ngOnInit() {
    await this.storageService.initFromDB();
    this.termsAccepted = this.terms.hasCurrentAcceptance();
    if (this.authService.isAuthenticated() && this.termsAccepted) {
      this.router.navigateByUrl(this.returnUrl.consume());
    }
  }

  async login() {
    this.errorMessage = '';
    try {
      if (!this.termsAccepted) throw new Error('Accept the Terms and Privacy Notice before connecting Spotify.');
      this.terms.acceptCurrent();
      await this.authService.loginWithSupabase();
    } catch (err) {
      console.error('Login failed', err);
      this.errorMessage = err instanceof Error ? err.message : 'Spotify login could not be started.';
    }
  }

  openPersonalApp(): void {
    this.errorMessage = '';
    if (!this.termsAccepted) {
      this.errorMessage = 'Accept the Terms and Privacy Notice before connecting Spotify.';
      return;
    }
    this.terms.acceptCurrent();
    void this.router.navigate(['/spotify/connect']);
  }
}
