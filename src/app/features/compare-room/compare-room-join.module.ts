import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';
import {SharedModule} from '@shared/shared.module';
import {CompareRoomJoinComponent} from './compare-room-join.component';

@NgModule({
  declarations: [CompareRoomJoinComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: CompareRoomJoinComponent}])
  ]
})
export class CompareRoomJoinModule {}
