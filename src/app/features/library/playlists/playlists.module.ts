import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {PlaylistsComponent} from './playlists.component';

@NgModule({
  declarations: [PlaylistsComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: '', component: PlaylistsComponent}])
  ]
})
export class PlaylistsModule {}
