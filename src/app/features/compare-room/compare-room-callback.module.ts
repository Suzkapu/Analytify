import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {CompareRoomCallbackComponent} from './compare-room-callback.component';

@NgModule({
  declarations: [CompareRoomCallbackComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: CompareRoomCallbackComponent}])
  ]
})
export class CompareRoomCallbackModule {}
