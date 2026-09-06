import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {PlaylistsComponent} from './playlists.component';

@NgModule({
  declarations: [PlaylistsComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: PlaylistsComponent}])
  ]
})
export class PlaylistsModule {}
