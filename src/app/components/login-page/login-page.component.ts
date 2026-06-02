import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {
  constructor(private authService: SpotifyAuthService, private router: Router) {
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/playlists']);
    }
  }

  async login() {
    window.location.href = await this.authService.getAuthorizationUrl();
  }
}
