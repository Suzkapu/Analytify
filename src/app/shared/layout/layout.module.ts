import {NgModule} from '@angular/core';

import {SharedModule} from '@shared/shared.module';
import {FooterComponent} from './footer/footer.component';
import {HeaderComponent} from './header/header.component';
import {AppShellComponent} from './app-shell/app-shell.component';
import {DesignV2ShellComponent} from './design-v2-shell/design-v2-shell.component';

@NgModule({
  declarations: [HeaderComponent, FooterComponent, AppShellComponent, DesignV2ShellComponent],
  imports: [SharedModule],
  exports: [HeaderComponent, FooterComponent, AppShellComponent, DesignV2ShellComponent]
})
export class LayoutModule {}
