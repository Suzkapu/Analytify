import {Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef} from '@angular/core';
import {Router} from '@angular/router';
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {AuthReturnUrlService} from '@core/auth/auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {CURRENT_TERMS_VERSION, TermsAcceptanceService} from '@core/legal/terms-acceptance.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';

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
  showAdvancedOptions = false;

  constructor(
    private authService: SpotifyAuthService,
    private storageService: StorageService,
    private router: Router,
    private returnUrl: AuthReturnUrlService,
    private terms: TermsAcceptanceService,
    readonly navigation: DesignNavigationService,
    private readonly changeDetector: ChangeDetectorRef
  ) {
  }

  async ngOnInit() {
    await this.storageService.initFromDB();
    this.termsAccepted = this.terms.hasCurrentAcceptance();
    this.changeDetector.markForCheck();
    if (this.authService.isAuthenticated() && this.termsAccepted) {
      this.router.navigateByUrl(this.returnUrl.consume(this.navigation.url('playlists')));
    }
  }

  async login() {
    this.errorMessage = '';
    try {
      if (!this.termsAccepted) throw new Error('Accept the Terms and Privacy Notice before connecting Spotify.');
      this.terms.acceptCurrent();
      this.returnUrl.remember(this.navigation.url('playlists'));
      await this.authService.loginWithSupabase();
    } catch (err) {
      console.error('Login failed', err);
      this.errorMessage = err instanceof Error ? err.message : 'Spotify login could not be started.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  openPersonalApp(): void {
    this.errorMessage = '';
    if (!this.termsAccepted) {
      this.errorMessage = 'Accept the Terms and Privacy Notice before connecting Spotify.';
      return;
    }
    this.terms.acceptCurrent();
    void this.navigation.navigate('spotifyConnect', {}, {
      queryParams: {returnUrl: this.navigation.url('playlists')}
    });
  }
}
