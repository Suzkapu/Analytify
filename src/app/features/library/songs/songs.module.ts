import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {SongsComponent} from './songs.component';

@NgModule({
  declarations: [SongsComponent],
  imports: [SharedModule],
  exports: [SongsComponent]
})
export class SongsUiModule {}

@NgModule({
  imports: [SongsUiModule, RouterModule.forChild([{path: ':id', component: SongsComponent}])]
})
export class SongsModule {}
