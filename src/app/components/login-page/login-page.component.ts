import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {
  constructor(
    private authService: SpotifyAuthService,
    private storageService: StorageService,
    private router: Router
  ) {
  }

  async ngOnInit() {
    await this.storageService.initFromDB();
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/playlists']);
    }
  }

  async login() {
    try {
      await this.authService.loginWithSupabase();
    } catch (err) {
      console.error('Login failed', err);
    }
  }
}
