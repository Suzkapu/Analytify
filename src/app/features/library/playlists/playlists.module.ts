import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {PlaylistsComponent} from './playlists.component';

@NgModule({
  declarations: [PlaylistsComponent],
  imports: [SharedModule],
  exports: [PlaylistsComponent]
})
export class PlaylistsUiModule {}

@NgModule({
  imports: [PlaylistsUiModule, RouterModule.forChild([{path: '', component: PlaylistsComponent}])]
})
export class PlaylistsModule {}
