import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {UserStatsComponent} from './user-stats.component';

@NgModule({
  declarations: [UserStatsComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([
      {path: ':userId', component: UserStatsComponent},
      {path: '', pathMatch: 'full', component: UserStatsComponent}
    ])
  ]
})
export class UserStatsModule {}
