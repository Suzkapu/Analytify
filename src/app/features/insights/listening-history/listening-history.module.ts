import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {ListeningHistoryComponent} from './listening-history.component';

@NgModule({
  declarations: [ListeningHistoryComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: '', component: ListeningHistoryComponent}])
  ]
})
export class ListeningHistoryModule {}
