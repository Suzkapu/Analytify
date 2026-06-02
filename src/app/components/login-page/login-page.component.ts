import {Component} from '@angular/core';
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent {
  constructor(private authService: SpotifyAuthService) {
  }

  async login() {
    window.location.href = await this.authService.getAuthorizationUrl();
  }
}
