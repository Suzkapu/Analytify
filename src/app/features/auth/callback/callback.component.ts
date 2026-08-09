import {Component, OnInit} from '@angular/core';
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {ActivatedRoute, Router} from "@angular/router";
import {AuthReturnUrlService} from '@core/auth/auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Login Callback');

@Component({
  selector: 'app-callback',
  templateUrl: './callback.component.html',
  styleUrls: ['./callback.component.scss']
})
export class CallbackComponent implements OnInit {
  errorMessage: string | null = null;
  loadingMessage: string = 'Logging in with Spotify...';
  isAutoRedirecting: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: SpotifyAuthService,
    private returnUrl: AuthReturnUrlService
  ) {
  }

  //Sets the access token
  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      const error = params['error'];
      
      if (code) {
        this.authService.exchangeSupabaseCodeForSession(code).subscribe({
          next: () => {
            void this.completeCallback('Authentication failed: Spotify token was not saved.');
          },
          error: (err) => {
            void this.handleCodeExchangeFailure(err);
          }
        });
      } else if (error) {
        void this.handleOAuthFailure(error);
      } else {
        // In case of hash fragment flow, wait a bit for Supabase client to parse URL hash
        setTimeout(() => {
          void this.handleImplicitCallback();
        }, 800);
      }
    });
  }

  private async handleCodeExchangeFailure(error: any): Promise<void> {
    console.error('Failed to exchange auth code for session', error);
    if (await this.resumeRecoveredSession()) return;

    const errorMessage = error?.message || JSON.stringify(error);
    if (
      errorMessage.includes('server_error') ||
      errorMessage.includes('expired') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('provider token') ||
      errorMessage.includes('missing')
    ) {
      this.autoRedirectToLogin('Session expired. Redirecting back to login...');
      return;
    }
    this.errorMessage = `Failed to exchange authorization code: ${errorMessage}`;
  }

  private async handleOAuthFailure(error: string): Promise<void> {
    console.error('Spotify login error', error);
    if (await this.resumeRecoveredSession()) return;

    // server_error = stale PKCE state or expired OAuth flow — auto retry
    if (error === 'server_error' || error === 'access_denied') {
      this.autoRedirectToLogin('Session expired. Redirecting back to login...');
      return;
    }
    this.errorMessage = `Spotify login error: ${error}`;
  }

  private async handleImplicitCallback(): Promise<void> {
    if (await this.resumeRecoveredSession()) return;

    this.authService.handleCallbackSession().subscribe({
      next: () => {
        void this.completeCallback('Authentication failed: Spotify token was not saved.');
      },
      error: (error) => {
        console.error('No active session found', error);
        this.errorMessage = 'No authorization code or active session found.';
      }
    });
  }

  private async completeCallback(errorMessage: string): Promise<void> {
    if (await this.resumeRecoveredSession()) return;
    this.errorMessage = errorMessage;
  }

  private async resumeRecoveredSession(): Promise<boolean> {
    try {
      if (!await this.authService.recoverUsableSession()) return false;
      await this.router.navigateByUrl(this.returnUrl.consume());
      return true;
    } catch (error) {
      console.warn('Existing session recovery failed', error);
      return false;
    }
  }

  private autoRedirectToLogin(message: string) {
    this.isAutoRedirecting = true;
    this.loadingMessage = message;
    // Clear any stale Supabase auth state before redirecting
    this.authService.clearSupabaseSession().then(() => {
      setTimeout(() => this.router.navigate(['/login']), 2000);
    });
  }
}
