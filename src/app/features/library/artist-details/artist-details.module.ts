import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {ArtistDetailsComponent} from './artist-details.component';

@NgModule({
  declarations: [ArtistDetailsComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: ':id', component: ArtistDetailsComponent}])
  ]
})
export class ArtistDetailsModule {}
