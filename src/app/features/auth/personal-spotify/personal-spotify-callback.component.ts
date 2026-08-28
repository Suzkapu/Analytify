import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';

@Component({
  selector: 'app-personal-spotify-callback',
  template: `
    <main class="callback-page"><section>
      <i class="pi" [ngClass]="errorMessage ? 'pi-exclamation-triangle error' : 'pi-spin pi-spinner'"></i>
      <h1>{{ errorMessage ? 'Spotify connection failed' : 'Connecting your personal Spotify app…' }}</h1>
      <p *ngIf="errorMessage">{{ errorMessage }}</p>
      <a *ngIf="errorMessage" routerLink="/spotify/connect">Return to setup</a>
    </section></main>
  `,
  styles: [`
    .callback-page { min-height: 100vh; display: grid; place-items: center; padding: 1rem; box-sizing: border-box; background: var(--color-bg); color: var(--color-text); text-align: center; }
    section { max-width: 560px; padding: 2rem; } i { color: var(--color-accent); font-size: 3rem; } i.error { color: #ff7474; }
    p { color: var(--color-text-muted); line-height: 1.5; } a { color: var(--color-accent); font-weight: 800; }
  `]
})
export class PersonalSpotifyCallbackComponent implements OnInit {
  errorMessage = '';

  constructor(private route: ActivatedRoute, private router: Router, private auth: SpotifyAuthService) {}

  async ngOnInit(): Promise<void> {
    const error = this.route.snapshot.queryParamMap.get('error');
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');
    if (error) {
      this.auth.clearPendingPersonalAppAuthorization();
      this.errorMessage = error === 'access_denied' ? 'Spotify access was declined. No connection was saved.' : `Spotify returned: ${error}`;
      return;
    }
    if (!code || !state) {
      this.auth.clearPendingPersonalAppAuthorization();
      this.errorMessage = 'Spotify did not return a complete authorization response.';
      return;
    }
    try {
      const returnUrl = await this.auth.handlePersonalAppCallback(code, state);
      await this.router.navigateByUrl(returnUrl);
    } catch (callbackError) {
      this.errorMessage = callbackError instanceof Error ? callbackError.message : 'Spotify authorization failed.';
    }
  }
}
