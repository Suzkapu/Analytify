import {Component, ViewEncapsulation, ChangeDetectionStrategy, Optional} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyAuthService} from "@core/auth/spotify-auth.service";
import {StorageService} from "@core/data-access/storage/storage.service";
import {PlaylistLoaderService} from "@core/sync/playlist-loader/playlist-loader.service";
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {PlaylistAnalysisController} from "./playlist-analysis.controller";
export {PlaylistAnalysisController} from "./playlist-analysis.controller";

@Component({
  selector: 'app-playlist-analysis',
  templateUrl: './playlist-analysis.component.html',
  styleUrls: ['./playlist-analysis.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class PlaylistAnalysisComponent extends PlaylistAnalysisController {
  constructor(
    route: ActivatedRoute,
    authService: SpotifyAuthService,
    router: Router,
    storageService: StorageService,
    playlistLoaderService: PlaylistLoaderService,
    @Optional() designNavigation?: DesignNavigationService
  ) {
    super(route, authService, router, storageService, playlistLoaderService, designNavigation);
  }
}
