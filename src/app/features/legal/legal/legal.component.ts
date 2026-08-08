import { Component } from '@angular/core';
import { Location } from '@angular/common';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';

@Component({
  selector: 'app-legal',
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.scss']
})
export class LegalComponent {
  constructor(
    private location: Location,
    private authService: SpotifyAuthService
  ) {}

  get isLoggedIn(): boolean {
    return this.authService.isAuthenticated();
  }

  goBack(): void {
    this.location.back();
  }
}
