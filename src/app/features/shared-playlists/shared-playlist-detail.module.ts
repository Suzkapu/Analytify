import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {SharedPlaylistDetailComponent} from './shared-playlist-detail.component';

@NgModule({
  declarations: [SharedPlaylistDetailComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: SharedPlaylistDetailComponent}])
  ]
})
export class SharedPlaylistDetailModule {}
