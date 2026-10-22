import {Routes} from '@angular/router';

import {adminGuard} from '@core/admin/admin.guard';
import {cloudIdentityGuard} from '@core/auth/cloud-identity.guard';
import {redirectLoggedInGuard} from '@core/auth/redirect-logged-in.guard';
import {spotifyAuthGuard} from '@core/auth/spotify-auth.guard';
import {spotifyRestrictedFeatureGuard} from '@core/compliance/spotify-policy-gate';
import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {DesignV2ShellComponent} from '@shared/layout/design-v2-shell/design-v2-shell.component';

export const DESIGN_V2_ROUTES: Routes = [{
  path: '',
  component: DesignV2ShellComponent,
  children: [
    {path: '', pathMatch: 'full', redirectTo: 'login'},
    {
      path: 'login', title: 'Sign in | Analytify',
      data: designV2RouteData('login', 'Sign in', 'form', 'account', {chromeMode: 'focus'}),
      canActivate: [redirectLoggedInGuard],
      loadChildren: () => import('@features/auth/login-page/login-page.module').then(module => module.LoginPageModule)
    },
    {
      path: 'callback', title: 'Finishing sign in | Analytify',
      data: designV2RouteData('callback', 'Signing in', 'form', 'account', {chromeMode: 'focus'}),
      loadChildren: () => import('@features/auth/callback/callback.module').then(module => module.CallbackModule)
    },
    {
      path: 'spotify', title: 'Spotify setup | Analytify',
      data: designV2RouteData('spotify', 'Spotify setup', 'form', 'account', {chromeMode: 'focus'}),
      loadChildren: () => import('@features/auth/personal-spotify/personal-spotify.module').then(module => module.PersonalSpotifyModule)
    },
    {
      path: 'playlists', title: 'Your playlists | Analytify',
      data: designV2RouteData('playlists', 'Your Playlists', 'dashboard', 'library', {preload: true}),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/library/design-v2/v2-playlists-page.component')
        .then(module => module.V2PlaylistsPageComponent)
    },
    {
      path: 'songs/:id', title: 'Playlist songs | Analytify',
      data: designV2RouteData('songs', 'Playlist Songs', 'dashboard', 'library', {mobileBack: true}),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/library/design-v2/v2-songs-page.component')
        .then(module => module.V2SongsPageComponent)
    },
    {
      path: 'artistDetails/:id', title: 'Artist details | Analytify',
      data: designV2RouteData('artist-details', 'Artist Details', 'default', 'library', {mobileBack: true}),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/library/design-v2/v2-artist-details-page.component')
        .then(module => module.V2ArtistDetailsPageComponent)
    },
    {
      path: 'analysis/:id', title: 'Playlist analysis | Analytify',
      data: designV2RouteData('analysis', 'Playlist Analysis', 'dashboard', 'library', {mobileBack: true}),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/library/design-v2/v2-analysis-page.component')
        .then(module => module.V2AnalysisPageComponent)
    },
    {
      path: 'stats/:userId', title: 'Shared listening stats | Analytify',
      data: designV2RouteData('stats', 'Shared Top Listening', 'dashboard', 'insights'),
      canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
      loadComponent: () => import('@features/insights/user-stats/v2-user-stats.component')
        .then(module => module.V2UserStatsComponent)
    },
    {
      path: 'stats', title: 'Your listening stats | Analytify',
      data: designV2RouteData('stats', 'Your Top Listening', 'dashboard', 'insights', {preload: true}),
      canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
      loadComponent: () => import('@features/insights/user-stats/v2-user-stats.component')
        .then(module => module.V2UserStatsComponent)
    },
    {
      path: 'history', title: 'Recently played | Analytify',
      data: designV2RouteData('history', 'Recently Played', 'dashboard', 'insights', {preload: true}),
      canActivate: [spotifyAuthGuard, spotifyRestrictedFeatureGuard],
      loadComponent: () => import('@features/insights/listening-history/v2-listening-history.component')
        .then(module => module.V2ListeningHistoryComponent)
    },
    {
      path: 'settings/install', title: 'Install Analytify | Analytify',
      data: designV2RouteData('settings', 'Install Analytify', 'full', 'account'),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/settings/v2-settings-install.component').then(module => module.V2SettingsInstallComponent)
    },
    {
      path: 'settings/updates/:id', title: 'Automatic updates | Analytify',
      data: designV2RouteData('settings', 'Automatic updates', 'full', 'account'),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/settings/v2-settings-updates.component').then(module => module.V2SettingsUpdateEditorComponent)
    },
    {
      path: 'settings', title: 'Settings | Analytify',
      data: designV2RouteData('settings', 'Settings', 'full', 'account'),
      canActivate: [spotifyAuthGuard],
      loadComponent: () => import('@features/settings/v2-settings-page.component').then(module => module.V2SettingsPageComponent),
      children: [
        {path: '', pathMatch: 'full', redirectTo: 'account'},
        {path: 'account', loadComponent: () => import('@features/settings/v2-settings-account-data.component').then(module => module.V2SettingsAccountComponent)},
        {path: 'notifications', loadComponent: () => import('@features/settings/v2-settings-notifications.component').then(module => module.V2SettingsNotificationsComponent)},
        {path: 'updates', loadComponent: () => import('@features/settings/v2-settings-updates.component').then(module => module.V2SettingsUpdatesComponent)},
        {path: 'data', loadComponent: () => import('@features/settings/v2-settings-account-data.component').then(module => module.V2SettingsDataComponent)},
        {path: 'navigation', loadComponent: () => import('@features/settings/v2-settings-navigation.component').then(module => module.V2SettingsNavigationComponent)}
      ]
    },
    {
      path: 'admin', title: 'Administration | Analytify',
      data: designV2RouteData('admin', 'Admin', 'full', 'admin'), canActivate: [spotifyAuthGuard, adminGuard],
      loadChildren: () => import('@features/admin/admin.module').then(module => module.AdminModule)
    },
    {
      path: 'song-league', title: 'Song League | Analytify',
      data: designV2RouteData('song-league', 'Song League', 'dashboard', 'league', {cloudBackup: true}),
      canActivate: [spotifyAuthGuard, cloudIdentityGuard, spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/song-league/song-league.module').then(module => module.SongLeagueModule)
    },
    {
      path: 'friends', title: 'Friends | Analytify',
      data: designV2RouteData('friends', 'Your friends', 'full', 'social', {cloudBackup: false}),
      canActivate: [spotifyAuthGuard, cloudIdentityGuard],
      loadChildren: () => import('@features/friends/friends.routes').then(module => module.FRIENDS_ROUTES)
    },
    {
      path: 'shared-playlists', title: 'Private Sharing | Analytify',
      data: designV2RouteData('private-sharing', 'Private Sharing', 'dashboard', 'social', {cloudBackup: false}),
      canActivate: [spotifyAuthGuard, cloudIdentityGuard],
      loadChildren: () => import('@features/shared-playlists/shared-playlists.module').then(module => module.SharedPlaylistsModule)
    },
    {
      path: 'legal', title: 'Legal information | Analytify',
      data: designV2RouteData('legal', 'Legal', 'reading', 'account', {chromeMode: 'public'}),
      loadChildren: () => import('@features/legal/legal/legal.module').then(module => module.LegalModule)
    },
    {
      path: 'compare-room/callback', title: 'Joining Compare Room | Analytify',
      data: designV2RouteData('compare-room-callback', 'Joining room', 'form', 'social', {chromeMode: 'public'}),
      canActivate: [spotifyRestrictedFeatureGuard],
      loadChildren: () => import('@features/compare-room/compare-room-callback.module').then(module => module.CompareRoomCallbackModule)
    },
    {
      path: 'compare-room/join/:roomId', title: 'Join Compare Room | Analytify',
      data: designV2RouteData('compare-room-join', 'Join room', 'form', 'social', {chromeMode: 'public'}),
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
