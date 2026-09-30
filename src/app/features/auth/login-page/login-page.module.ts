import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {LoginPageComponent} from './login-page.component';

@NgModule({
  declarations: [LoginPageComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{path: '', component: LoginPageComponent}])
  ]
})
export class LoginPageModule {}
