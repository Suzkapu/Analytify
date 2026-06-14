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
            this.errorMessage = `Failed to exchange authorization code: ${err.message || JSON.stringify(err)}`;
          }
        });
      } else if (error) {
        console.error('Spotify login error', error);
        this.errorMessage = `Spotify login error: ${error}`;
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
}
