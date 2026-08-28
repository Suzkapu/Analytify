import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';

@Component({
  selector: 'app-cloud-access',
  template: `
    <main class="cloud-page"><section>
      <i class="pi pi-cloud-upload hero-icon"></i>
      <span class="eyebrow">Optional cloud access</span>
      <h1>{{ enableBackup ? 'Enable Cloud Backup' : 'Enable this workspace feature' }}</h1>
      <p>Analytify will create an anonymous cloud identity. It stores your Spotify ID, display name, profile image, selected listening snapshots, and an encrypted Spotify refresh token for scheduled features.</p>
      <ul>
        <li>No email address, phone number, password, or recovery identity is requested.</li>
        <li>Your Spotify Client Secret is never requested or stored.</li>
        <li>The identity is bound to this browser and cannot be recovered after you clear its data.</li>
      </ul>
      <p class="warning"><i class="pi pi-exclamation-triangle"></i> Logging out or clearing this browser will permanently delete the anonymous cloud identity and its linked data.</p>
      <p class="error" *ngIf="errorMessage">{{ errorMessage }}</p>
      <div class="actions">
        <button type="button" class="secondary" (click)="cancel()">Not now</button>
        <button type="button" class="primary" (click)="confirm()" [disabled]="working"><i class="pi" [ngClass]="working ? 'pi-spin pi-spinner' : 'pi-cloud'"></i>{{ working ? 'Enabling…' : 'I understand, enable' }}</button>
      </div>
    </section></main>
  `,
  styles: [`
    .cloud-page { min-height: 100vh; display: grid; place-items: center; padding: 20px; box-sizing: border-box; background: var(--color-bg); }
    section { width: min(620px, 100%); box-sizing: border-box; padding: clamp(26px, 5vw, 48px); border: 1px solid var(--color-border-strong); border-radius: var(--radius-xl); background: var(--color-surface-raised); color: var(--color-text); }
    .hero-icon { color: var(--color-accent); font-size: 2.5rem; } .eyebrow { display: block; margin-top: 18px; color: var(--color-accent); font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 8px 0 14px; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.04em; } p, li { color: var(--color-text-muted); line-height: 1.55; } ul { padding-left: 22px; }
    .warning { padding: 12px; border: 1px solid rgba(255,190,70,.3); border-radius: 12px; background: rgba(255,190,70,.08); } .warning i { margin-right: 8px; color: #ffbe46; }
    .error { color: #ff7474; } .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; } button { min-height: 46px; border-radius: var(--radius-pill); padding: 0 18px; font: inherit; font-weight: 800; cursor: pointer; }
    .secondary { border: 1px solid var(--color-border-strong); background: transparent; color: var(--color-text); } .primary { border: 0; background: var(--color-accent); color: var(--color-accent-contrast); } button:disabled { opacity: .55; } button i { margin-right: 7px; }
  `]
})
export class CloudAccessComponent implements OnInit {
  returnUrl = '/playlists';
  enableBackup = false;
  working = false;
  errorMessage = '';

  constructor(private route: ActivatedRoute, private router: Router, private auth: SpotifyAuthService) {}

  ngOnInit(): void {
    this.returnUrl = this.safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
    this.enableBackup = this.route.snapshot.queryParamMap.get('backup') === '1';
    if (this.auth.hasCloudIdentity()) void this.router.navigateByUrl(this.returnUrl);
  }

  async confirm(): Promise<void> {
    this.working = true;
    this.errorMessage = '';
    try {
      if (this.enableBackup) await this.auth.enableBackup();
      else await this.auth.enableCloudIdentity();
      await this.router.navigateByUrl(this.returnUrl);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Cloud access could not be enabled.';
      this.working = false;
    }
  }

  cancel(): void { void this.router.navigateByUrl('/playlists'); }

  private safeReturnUrl(value: string | null): string {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/playlists';
  }
}

