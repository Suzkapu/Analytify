import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {CompareRoomCallbackComponent} from './compare-room-callback.component';
import {CompareRoomJoinComponent} from './compare-room-join.component';
import {CompareRoomShellComponent} from './compare-room-shell.component';

@NgModule({
  declarations: [CompareRoomShellComponent, CompareRoomJoinComponent, CompareRoomCallbackComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {path: 'callback', component: CompareRoomCallbackComponent},
      {path: 'join/:roomId', component: CompareRoomJoinComponent},
      {path: '', component: CompareRoomShellComponent}
    ])
  ]
})
export class CompareRoomModule {}
