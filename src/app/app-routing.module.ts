import {NgModule} from '@angular/core';
import {ExtraOptions, RouterModule, Routes} from '@angular/router';

import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';

export const APP_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [redirectLoggedInGuard],
    loadChildren: () =>
      import('@features/auth/login-page/login-page.module').then(module => module.LoginPageModule)
  },
  {
    path: 'login',
    canActivate: [redirectLoggedInGuard],
    loadChildren: () =>
      import('@features/auth/login-page/login-page.module').then(module => module.LoginPageModule)
  },
  {
    path: 'callback',
    loadChildren: () =>
      import('@features/auth/callback/callback.module').then(module => module.CallbackModule)
  },
  {
    path: 'playlists',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/library/playlists/playlists.module').then(module => module.PlaylistsModule)
  },
  {
    path: 'songs',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/library/songs/songs.module').then(module => module.SongsModule)
  },
  {
    path: 'artistDetails',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/library/artist-details/artist-details.module').then(module => module.ArtistDetailsModule)
  },
  {
    path: 'analysis',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/library/playlist-analysis/playlist-analysis.module').then(module => module.PlaylistAnalysisModule)
  },
  {
    path: 'stats',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/insights/user-stats/user-stats.module').then(module => module.UserStatsModule)
  },
  {
    path: 'history',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/insights/listening-history/listening-history.module').then(module => module.ListeningHistoryModule)
  },
  {
    path: 'song-league',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/song-league/song-league.module').then(module => module.SongLeagueModule)
  },
  {
    path: 'shared-playlists',
    canActivate: [spotifyAuthGuard],
    loadChildren: () =>
      import('@features/shared-playlists/shared-playlists.module').then(module => module.SharedPlaylistsModule)
  },
  {
    path: 'legal',
    loadChildren: () =>
      import('@features/legal/legal/legal.module').then(module => module.LegalModule)
  },
  {
    path: 'compare-room',
    loadChildren: () =>
      import('@features/compare-room/compare-room.module').then(module => module.CompareRoomModule)
  },
  {path: '**', redirectTo: ''}
];

export const ROUTER_OPTIONS: ExtraOptions = {
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
  scrollOffset: [0, 96]
};

@NgModule({
  imports: [RouterModule.forRoot(APP_ROUTES, ROUTER_OPTIONS)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
