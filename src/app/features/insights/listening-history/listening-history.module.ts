import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {ListeningHistoryComponent} from './listening-history.component';

@NgModule({
  declarations: [ListeningHistoryComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: ListeningHistoryComponent}])
  ]
})
export class ListeningHistoryModule {}
