import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {LayoutModule} from '@shared/layout/layout.module';
import {SharedPlaylistsComponent} from './shared-playlists.component';
import {SharedPlaylistDetailComponent} from './shared-playlist-detail.component';
import {SharedPlaylistClaimComponent} from './shared-playlist-claim.component';

@NgModule({
  declarations: [
    SharedPlaylistsComponent,
    SharedPlaylistDetailComponent,
    SharedPlaylistClaimComponent
  ],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([
      {path: '', pathMatch: 'full', component: SharedPlaylistsComponent},
      {path: 'claim/:token', component: SharedPlaylistClaimComponent},
      {path: ':id', component: SharedPlaylistDetailComponent}
    ])
  ]
})
export class SharedPlaylistsModule {}
