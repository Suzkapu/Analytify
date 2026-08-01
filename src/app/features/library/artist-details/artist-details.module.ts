import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {ArtistDetailsComponent} from './artist-details.component';

@NgModule({
  declarations: [ArtistDetailsComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: ':id', component: ArtistDetailsComponent}])
  ]
})
export class ArtistDetailsModule {}
