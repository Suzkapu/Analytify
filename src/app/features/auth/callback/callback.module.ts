import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {CallbackComponent} from './callback.component';

@NgModule({
  declarations: [CallbackComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: CallbackComponent}])
  ]
})
export class CallbackModule {}
