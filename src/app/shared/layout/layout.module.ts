import {NgModule} from '@angular/core';

import {SharedModule} from '@shared/shared.module';
import {FooterComponent} from './footer/footer.component';
import {HeaderComponent} from './header/header.component';

@NgModule({
  declarations: [HeaderComponent, FooterComponent],
  imports: [SharedModule],
  exports: [HeaderComponent, FooterComponent]
})
export class LayoutModule {}
