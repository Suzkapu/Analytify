import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {LegalComponent} from './legal.component';

@NgModule({
  declarations: [LegalComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: '', component: LegalComponent}])
  ]
})
export class LegalModule {}
