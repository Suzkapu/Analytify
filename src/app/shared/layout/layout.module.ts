import {NgModule} from '@angular/core';

import {SharedModule} from '@shared/shared.module';
import {FooterComponent} from './footer/footer.component';
import {HeaderComponent} from './header/header.component';
import {AppShellComponent} from './app-shell/app-shell.component';

@NgModule({
  declarations: [HeaderComponent, FooterComponent, AppShellComponent],
  imports: [SharedModule],
  exports: [HeaderComponent, FooterComponent, AppShellComponent]
})
export class LayoutModule {}
