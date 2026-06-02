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
        this.authService.exchangeCodeForToken(code).subscribe({
          next: () => {
            if (this.authService.isAuthenticated()) {
              this.spotifyDataService.getCurrentUser().subscribe({
                next: (user: any) => {
                  if (user && user.id) {
                    this.authService.setUserId(user.id);
                  }
                  this.router.navigate(['/playlists']);
                },
                error: (userErr) => {
                  console.error('Failed to fetch Spotify user profile', userErr);
                  // Navigate anyway as fallback
                  this.router.navigate(['/playlists']);
                }
              });
            } else {
              this.errorMessage = 'Authentication failed: Access token was not saved.';
            }
          },
          error: (err) => {
            console.error('Failed to exchange auth code for token', err);
            this.errorMessage = `Failed to exchange authorization code: ${err.error?.error_description || err.message || JSON.stringify(err)}`;
          }
        });
      } else if (error) {
        console.error('Spotify login error', error);
        this.errorMessage = `Spotify login error: ${error}`;
      } else {
        this.errorMessage = 'No authorization code or state found in URL query parameters.';
      }
    });
  }
}
