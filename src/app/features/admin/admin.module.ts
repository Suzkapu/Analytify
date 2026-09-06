import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {AdminComponent} from './admin.component';

@NgModule({
  declarations: [AdminComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: AdminComponent}])
  ]
})
export class AdminModule {}
