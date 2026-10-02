import {Component, ChangeDetectionStrategy, Optional} from '@angular/core';
import {SpotifyDataService} from "@core/data-access/spotify/spotify-data.service";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {ActivatedRoute, Router} from "@angular/router";
import {SupabaseService} from "@core/data-access/supabase/supabase.service";
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {ArtistDetailsController} from "./artist-details.controller";
export {ArtistDetailsController} from "./artist-details.controller";

@Component({
  selector: 'app-artist-details',
  templateUrl: './artist-details.component.html',
  styleUrls: ['./artist-details.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ArtistDetailsComponent extends ArtistDetailsController {
  constructor(
    route: ActivatedRoute,
    spotifyDataService: SpotifyDataService,
    router: Router,
    authService: SpotifyAuthService,
    storageService: StorageService,
    supabaseService: SupabaseService,
    @Optional() designNavigation?: DesignNavigationService
  ) {
    super(route, spotifyDataService, router, authService, storageService, supabaseService, designNavigation);
  }
}
