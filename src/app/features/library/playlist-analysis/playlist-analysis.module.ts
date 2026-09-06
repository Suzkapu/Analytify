import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {PlaylistAnalysisComponent} from './playlist-analysis.component';

@NgModule({
  declarations: [PlaylistAnalysisComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: ':id', component: PlaylistAnalysisComponent}])
  ]
})
export class PlaylistAnalysisModule {}
