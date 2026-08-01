import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {TransientParticipantAuthService} from '@core/compare-room/transient-participant-auth.service';

@Component({
  selector: 'app-compare-room-callback',
  template: `
    <main class="compare-callback">
      <section>
        <i *ngIf="!errorMessage" class="pi pi-spin pi-spinner"></i>
        <i *ngIf="errorMessage" class="pi pi-exclamation-triangle error"></i>
        <h1>{{ errorMessage ? 'Spotify connection failed' : 'Connecting your Spotify account…' }}</h1>
        <p *ngIf="errorMessage">{{ errorMessage }}</p>
        <a *ngIf="errorMessage" routerLink="/compare-room">Return to Compare Room</a>
      </section>
    </main>
  `,
  styles: [`
    .compare-callback { min-height: 100vh; display: grid; place-items: center; padding: 1rem; box-sizing: border-box; background: #090b0a; color: white; text-align: center; }
    section { max-width: 520px; padding: 2rem; }
    i { color: #1ed760; font-size: 3rem; }
    i.error { color: #ff7474; }
    p { color: #a1aaa4; line-height: 1.5; }
    a { color: #1ed760; font-weight: 700; }
  `]
})
export class CompareRoomCallbackComponent implements OnInit {
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: TransientParticipantAuthService
  ) {}

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error) {
      this.errorMessage = error === 'access_denied'
        ? 'Spotify access was declined. Scan the invitation again when you are ready.'
        : `Spotify returned: ${error}`;
      return;
    }
    if (!code || !state) {
      this.errorMessage = 'Spotify did not return a complete authorization response.';
      return;
    }
    try {
      const returnUrl = await this.auth.handleCallback(code, state);
      await this.router.navigateByUrl(returnUrl);
    } catch (callbackError) {
      this.errorMessage = callbackError instanceof Error ? callbackError.message : 'Spotify authorization failed.';
    }
  }
}
