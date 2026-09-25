import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

import {adminGuard} from '@core/admin/admin.guard';
import {cloudIdentityGuard} from '@core/auth/cloud-identity.guard';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {spotifyRestrictedFeatureGuard} from '@core/compliance/spotify-policy-gate';
import {DESIGN_VARIANT} from '@core/navigation/design-navigation';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {DesignV2ShellComponent} from '@shared/layout/design-v2-shell/design-v2-shell.component';

export const DESIGN_V2_ROUTES: Routes = [{
  path: '',
  component: DesignV2ShellComponent,
  providers: [{provide: DESIGN_VARIANT, useValue: 'new'}, DesignNavigationService],
  children: [
    {path: '', pathMatch: 'full', redirectTo: 'login'},
    {
      path: 'login', title: 'Sign in | Analytify',
      data: designV2RouteData('login', 'Sign in', 'standard', 'account'),
      canActivate: [redirectLoggedInGuard],
      loadChildren: () => import('@features/auth/login-page/login-page.module').then(module => module.LoginPageModule)
    },
    {
      path: 'callback', title: 'Finishing sign in | Analytify',
      data: designV2RouteData('callback', 'Signing in', 'standard', 'account'),
      loadChildren: () => import('@features/auth/callback/callback.module').then(module => module.CallbackModule)
    },
    {
      path: 'spotify', title: 'Spotify setup | Analytify',
      data: designV2RouteData('spotify', 'Spotify setup', 'standard', 'account'),
      loadChildren: () => import('@features/auth/personal-spotify/personal-spotify.module').then(module => module.PersonalSpotifyModule)
    },
    {
      path: 'playlists', title: 'Your playlists | Analytify',
      data: designV2RouteData('playlists', 'Your Playlists', 'wide', 'library', {preload: true}),
      canActivate: [spotifyAuthGuard],
      loadChildren: () => import('@features/library/playlists/playlists.module').then(module => module.PlaylistsModule)
    },
    {
      path: 'songs', title: 'Playlist songs | Analytify',
      data: designV2RouteData('songs', 'Playlist Songs', 'wide', 'library', {mobileBack: true}),
      canActivate: [spotifyAuthGuard],
      loadChildren: () => import('@features/library/songs/songs.module').then(module => module.SongsModule)
    },
    {
      path: 'artistDetails', title: 'Artist details | Analytify',
      data: designV2RouteData('artist-details', 'Artist Details', 'standard', 'library', {mobileBack: true}),
      canActivate: [spotifyAuthGuard],
      loadChildren: () => import('@features/library/artist-details/artist-details.module').then(module => module.ArtistDetailsModule)
    },
    {
      path: 'analysis', title: 'Playlist analysis | Analytify',
      data: designV2RouteData('analysis', 'Playlist Analysis', 'wide', 'library', {mobileBack: true}),
      canActivate: [spotifyAuthGuard],
      loadChildren: () => import('@features/library/playlist-analysis/playlist-analysis.module').then(module => module.PlaylistAnalysisModule)
    },
    {
      path: 'stats', title: 'Your listening stats | Analytify',
      data: designV2RouteData('stats', 'Your Top Listening', 'wide', 'insights', {preload: true}),
      canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/insights/user-stats/user-stats.module').then(module => module.UserStatsModule)
    },
    {
      path: 'history', title: 'Recently played | Analytify',
      data: designV2RouteData('history', 'Recently Played', 'wide', 'insights', {preload: true}),
      canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/insights/listening-history/listening-history.module').then(module => module.ListeningHistoryModule)
    },
    {
      path: 'admin', title: 'Administration | Analytify',
      data: designV2RouteData('admin', 'Admin', 'full', 'admin'), canActivate: [spotifyAuthGuard, adminGuard],
      loadChildren: () => import('@features/admin/admin.module').then(module => module.AdminModule)
    },
    {
      path: 'song-league', title: 'Song League | Analytify',
      data: designV2RouteData('song-league', 'Song League', 'wide', 'social', {cloudBackup: true}),
      canActivate: [spotifyAuthGuard, cloudIdentityGuard, spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/song-league/song-league.module').then(module => module.SongLeagueModule)
    },
    {
      path: 'shared-playlists', title: 'Private Sharing | Analytify',
      data: designV2RouteData('private-sharing', 'Private Sharing', 'wide', 'social', {cloudBackup: false}),
      canActivate: [spotifyAuthGuard, cloudIdentityGuard],
      loadChildren: () => import('@features/shared-playlists/shared-playlists.module').then(module => module.SharedPlaylistsModule)
    },
    {
      path: 'legal', title: 'Legal information | Analytify',
      data: designV2RouteData('legal', 'Legal', 'standard', 'account'),
      loadChildren: () => import('@features/legal/legal/legal.module').then(module => module.LegalModule)
    },
    {
      path: 'compare-room/callback', title: 'Joining Compare Room | Analytify',
      data: designV2RouteData('compare-room-callback', 'Joining room', 'standard', 'social'),
      canActivate: [spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/compare-room/compare-room-callback.module').then(module => module.CompareRoomCallbackModule)
    },
    {
      path: 'compare-room/join/:roomId', title: 'Join Compare Room | Analytify',
      data: designV2RouteData('compare-room-join', 'Join room', 'standard', 'social'),
      canActivate: [spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/compare-room/compare-room-join.module').then(module => module.CompareRoomJoinModule)
    },
    {
      path: 'compare-room', title: 'Compare Room | Analytify',
      data: designV2RouteData('compare-room', 'Compare Room', 'full', 'social'),
      canActivate: [spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/compare-room/compare-room.module').then(module => module.CompareRoomModule)
    },
    {path: '**', redirectTo: 'login'}
  ]
}];

@NgModule({imports: [RouterModule.forChild(DESIGN_V2_ROUTES)]})
export class DesignV2RoutingModule {}
