import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {LayoutModule} from '@shared/layout/layout.module';
import {CompareRoomShellComponent} from './compare-room-shell.component';

@NgModule({
  declarations: [CompareRoomShellComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([
      {path: '', component: CompareRoomShellComponent}
    ])
  ]
})
export class CompareRoomModule {}
