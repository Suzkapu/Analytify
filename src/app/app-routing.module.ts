import {NgModule} from '@angular/core';
import {ExtraOptions, RouterModule, Routes} from '@angular/router';

import {adminGuard} from '@core/admin/admin.guard';
import {cloudIdentityGuard} from '@core/auth/cloud-identity.guard';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {spotifyRestrictedFeatureGuard} from '@core/compliance/spotify-policy-gate';
import {AppShellComponent} from '@shared/layout/app-shell/app-shell.component';
import {DesignSelectivePreloadingStrategy} from '@core/navigation/design-selective-preloading.strategy';

const PRODUCT_ROUTES: Routes = [
  {
    path: 'playlists', data: {mobileTitle: 'Your Playlists'}, canActivate: [spotifyAuthGuard],
    loadChildren: () => import('@features/library/playlists/playlists.module').then(module => module.PlaylistsModule)
  },
  {
    path: 'songs', data: {mobileTitle: 'Playlist Songs', mobileBack: true}, canActivate: [spotifyAuthGuard],
    loadChildren: () => import('@features/library/songs/songs.module').then(module => module.SongsModule)
  },
  {
    path: 'artistDetails', data: {mobileTitle: 'Artist Details', mobileBack: true}, canActivate: [spotifyAuthGuard],
    loadChildren: () => import('@features/library/artist-details/artist-details.module').then(module => module.ArtistDetailsModule)
  },
  {
    path: 'analysis', data: {mobileTitle: 'Playlist Analysis', mobileBack: true}, canActivate: [spotifyAuthGuard],
    loadChildren: () => import('@features/library/playlist-analysis/playlist-analysis.module').then(module => module.PlaylistAnalysisModule)
  },
  {
    path: 'stats', data: {mobileTitle: 'Your Top Listening'}, canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
    loadChildren: () => import('@features/insights/user-stats/user-stats.module').then(module => module.UserStatsModule)
  },
  {
    path: 'history', data: {mobileTitle: 'Recently Played'}, canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
    loadChildren: () => import('@features/insights/listening-history/listening-history.module').then(module => module.ListeningHistoryModule)
  },
  {
    path: 'admin', data: {mobileTitle: 'Admin'}, canActivate: [spotifyAuthGuard, adminGuard],
    loadChildren: () => import('@features/admin/admin.module').then(module => module.AdminModule)
  },
  {
    path: 'song-league', data: {cloudBackup: true, mobileTitle: 'Song League'},
    canActivate: [spotifyAuthGuard, cloudIdentityGuard, spotifyRestrictedFeatureGuard],
    loadChildren: () => import('@features/song-league/song-league.module').then(module => module.SongLeagueModule)
  },
  {
    path: 'shared-playlists', title: 'Private Sharing | Analytify',
    data: {cloudBackup: false, mobileTitle: 'Private Sharing'},
    canActivate: [spotifyAuthGuard, cloudIdentityGuard],
    loadChildren: () => import('@features/shared-playlists/shared-playlists.module').then(module => module.SharedPlaylistsModule)
  }
];

const PUBLIC_TOOL_ROUTES: Routes = [
  {
    path: 'legal',
    loadChildren: () => import('@features/legal/legal/legal.module').then(module => module.LegalModule)
  },
  {
    path: 'compare-room/callback', canActivate: [spotifyRestrictedFeatureGuard],
    loadChildren: () => import('@features/compare-room/compare-room-callback.module').then(module => module.CompareRoomCallbackModule)
  },
  {
    path: 'compare-room/join/:roomId', canActivate: [spotifyRestrictedFeatureGuard],
    loadChildren: () => import('@features/compare-room/compare-room-join.module').then(module => module.CompareRoomJoinModule)
  },
  {
    path: 'compare-room', canActivate: [spotifyRestrictedFeatureGuard],
    loadChildren: () => import('@features/compare-room/compare-room.module').then(module => module.CompareRoomModule)
  }
];

export const APP_ROUTES: Routes = [
  {
    path: '', pathMatch: 'full', canActivate: [redirectLoggedInGuard],
    loadChildren: () => import('@features/auth/login-page/login-page.module').then(module => module.LoginPageModule)
  },
  {
    path: 'login', canActivate: [redirectLoggedInGuard],
    loadChildren: () => import('@features/auth/login-page/login-page.module').then(module => module.LoginPageModule)
  },
  {
    path: 'callback',
    loadChildren: () => import('@features/auth/callback/callback.module').then(module => module.CallbackModule)
  },
  {
    path: 'spotify',
    loadChildren: () => import('@features/auth/personal-spotify/personal-spotify.module').then(module => module.PersonalSpotifyModule)
  },
  {path: '', component: AppShellComponent, children: PRODUCT_ROUTES},
  {
    path: 'new',
    loadChildren: () => import('./design-v2-routing.module')
      .then(module => module.DesignV2RoutingModule)
  },
  ...PUBLIC_TOOL_ROUTES,
  {path: '**', redirectTo: ''}
];

export const ROUTER_OPTIONS: ExtraOptions = {
  preloadingStrategy: DesignSelectivePreloadingStrategy,
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
  scrollOffset: [0, 96]
};

@NgModule({
  imports: [RouterModule.forRoot(APP_ROUTES, ROUTER_OPTIONS)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
