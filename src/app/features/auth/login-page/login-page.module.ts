import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {CommonModule} from '@angular/common';
import {LayoutModule} from '@shared/layout/layout.module';
import {LoginPageComponent} from './login-page.component';

@NgModule({
  declarations: [LoginPageComponent],
  imports: [
    CommonModule,
    LayoutModule,
    RouterModule.forChild([{path: '', component: LoginPageComponent}])
  ]
})
export class LoginPageModule {}
