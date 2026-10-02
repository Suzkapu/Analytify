import {Component, ViewEncapsulation, NgZone, ChangeDetectionStrategy, Optional} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {PlaylistLoaderService} from "@core/sync/playlist-loader/playlist-loader.service";
import {ImageHealingService} from "@core/sync/image-healing/image-healing.service";
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {SongsController} from "./songs.controller";
export {SongsController} from "./songs.controller";

@Component({
  selector: 'app-songs',
  templateUrl: './songs.component.html',
  styleUrls: ['./songs.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SongsComponent extends SongsController {
  constructor(
    route: ActivatedRoute,
    router: Router,
    authService: SpotifyAuthService,
    storageService: StorageService,
    playlistLoaderService: PlaylistLoaderService,
    imageHealingService: ImageHealingService,
    ngZone: NgZone,
    @Optional() designNavigation?: DesignNavigationService
  ) {
    super(route, router, authService, storageService, playlistLoaderService, imageHealingService, ngZone,
      designNavigation);
  }
}
