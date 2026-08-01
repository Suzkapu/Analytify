import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {SongsComponent} from './songs.component';

@NgModule({
  declarations: [SongsComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: ':id', component: SongsComponent}])
  ]
})
export class SongsModule {}
