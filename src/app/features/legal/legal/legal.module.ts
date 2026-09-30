import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {LegalComponent} from './legal.component';

@NgModule({
  declarations: [LegalComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: LegalComponent}])
  ]
})
export class LegalModule {}
