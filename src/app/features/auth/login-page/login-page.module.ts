import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {LayoutModule} from '@shared/layout/layout.module';
import {SharedModule} from '@shared/shared.module';
import {LoginPageComponent} from './login-page.component';

@NgModule({
  declarations: [LoginPageComponent],
  imports: [
    SharedModule,
    LayoutModule,
    RouterModule.forChild([{path: '', component: LoginPageComponent}])
  ]
})
export class LoginPageModule {}
