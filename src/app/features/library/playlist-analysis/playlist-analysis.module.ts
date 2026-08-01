import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {PlaylistAnalysisComponent} from './playlist-analysis.component';

@NgModule({
  declarations: [PlaylistAnalysisComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: ':id', component: PlaylistAnalysisComponent}])
  ]
})
export class PlaylistAnalysisModule {}
