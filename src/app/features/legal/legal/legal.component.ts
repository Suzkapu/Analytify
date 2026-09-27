import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';

@Component({
    selector: 'app-legal',
    templateUrl: './legal.component.html',
    styleUrls: ['./legal.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LegalComponent {
  constructor(
    private location: Location,
    private authService: SpotifyAuthService,
    readonly navigation: DesignNavigationService
  ) {}

  get isLoggedIn(): boolean {
    return this.authService.isAuthenticated();
  }

  get isDesignV2(): boolean {
    return this.navigation.variant === 'new';
  }

  goBack(): void {
    this.location.back();
  }
}
