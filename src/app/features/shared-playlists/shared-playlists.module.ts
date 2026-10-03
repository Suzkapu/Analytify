import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {SharedPlaylistsComponent} from './shared-playlists.component';
import {SharedPlaylistClaimComponent} from './shared-playlist-claim.component';
import {StatsRequestClaimComponent} from './stats-request-claim.component';
import {StatsShareClaimComponent} from './stats-share-claim.component';
import {spotifyRestrictedFeatureGuard} from '@core/compliance/spotify-policy-gate';

@NgModule({
  declarations: [
    SharedPlaylistsComponent,
    SharedPlaylistClaimComponent,
    StatsRequestClaimComponent,
    StatsShareClaimComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {path: '', pathMatch: 'full', component: SharedPlaylistsComponent},
      {path: 'claim/:token', component: SharedPlaylistClaimComponent},
      {path: 'stats-request/:token', component: StatsRequestClaimComponent, canActivate: [spotifyRestrictedFeatureGuard]},
      {path: 'stats-share/:token', component: StatsShareClaimComponent, canActivate: [spotifyRestrictedFeatureGuard]},
      {
        path: ':id',
        loadChildren: () => import('./shared-playlist-detail.module').then(module => module.SharedPlaylistDetailModule)
      }
    ])
  ]
})
export class SharedPlaylistsModule {}
