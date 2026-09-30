import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {UserStatsComponent} from './user-stats.component';

@NgModule({
  declarations: [UserStatsComponent],
  imports: [SharedModule],
  exports: [UserStatsComponent]
})
export class UserStatsUiModule {}

@NgModule({
  imports: [
    UserStatsUiModule,
    RouterModule.forChild([
      {path: ':userId', component: UserStatsComponent},
      {path: '', pathMatch: 'full', component: UserStatsComponent}
    ])
  ]
})
export class UserStatsModule {}
