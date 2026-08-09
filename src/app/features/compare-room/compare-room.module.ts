import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {CompareRoomCallbackComponent} from './compare-room-callback.component';
import {CompareRoomJoinComponent} from './compare-room-join.component';
import {CompareRoomShellComponent} from './compare-room-shell.component';

@NgModule({
  declarations: [CompareRoomShellComponent, CompareRoomJoinComponent, CompareRoomCallbackComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([
      {path: 'callback', component: CompareRoomCallbackComponent},
      {path: 'join/:roomId', component: CompareRoomJoinComponent},
      {path: '', component: CompareRoomShellComponent}
    ])
  ]
})
export class CompareRoomModule {}
