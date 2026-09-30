import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {CompareRoomShellComponent} from './compare-room-shell.component';

@NgModule({
  declarations: [CompareRoomShellComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {path: '', component: CompareRoomShellComponent}
    ])
  ]
})
export class CompareRoomModule {}
