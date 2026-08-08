import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {AuthReturnUrlService} from '@core/auth/auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Login');

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {
  constructor(
    private authService: SpotifyAuthService,
    private storageService: StorageService,
    private router: Router,
    private returnUrl: AuthReturnUrlService
  ) {
  }

  async ngOnInit() {
    await this.storageService.initFromDB();
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl(this.returnUrl.consume());
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
