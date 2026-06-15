import {Component, OnInit} from '@angular/core';
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";

@Component({
  selector: 'app-callback',
  templateUrl: './callback.component.html',
  styleUrls: ['./callback.component.scss']
})
export class CallbackComponent implements OnInit {
  playlists: any[] = [];
  errorMessage: string | null = null;
  loadingMessage: string = 'Logging in with Spotify...';
  isAutoRedirecting: boolean = false;

  constructor(private router: Router, private route: ActivatedRoute, private authService: SpotifyAuthService, private spotifyDataService: SpotifyDataService) {
  }

  //Sets the access token
  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const code = params['code'];
      const error = params['error'];
      
      if (code) {
        this.authService.exchangeSupabaseCodeForSession(code).subscribe({
          next: () => {
            if (this.authService.isAuthenticated()) {
              this.router.navigate(['/playlists']);
            } else {
              this.errorMessage = 'Authentication failed: Spotify token was not saved.';
            }
          },
          error: (err) => {
            console.error('Failed to exchange auth code for session', err);
            // server_error often means stale PKCE state — auto retry login
            const errMsg = err.message || JSON.stringify(err);
            if (errMsg.includes('server_error') || errMsg.includes('expired') || errMsg.includes('invalid')) {
              this.autoRedirectToLogin('Session expired. Redirecting back to login...');
            } else {
              this.errorMessage = `Failed to exchange authorization code: ${errMsg}`;
            }
          }
        });
      } else if (error) {
        console.error('Spotify login error', error);
        // server_error = stale PKCE state or expired OAuth flow — auto retry
        if (error === 'server_error' || error === 'access_denied') {
          this.autoRedirectToLogin('Session expired. Redirecting back to login...');
        } else {
          this.errorMessage = `Spotify login error: ${error}`;
        }
      } else {
        // In case of hash fragment flow, wait a bit for Supabase client to parse URL hash
        setTimeout(() => {
          this.authService.handleCallbackSession().subscribe({
            next: () => {
              if (this.authService.isAuthenticated()) {
                this.router.navigate(['/playlists']);
              } else {
                this.errorMessage = 'Authentication failed: Spotify token was not saved.';
              }
            },
            error: (err) => {
              console.error('No active session found', err);
              this.errorMessage = 'No authorization code or active session found.';
            }
          });
        }, 800);
      }
    });
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
