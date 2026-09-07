import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {MetricCardComponent} from './ui/metric-card/metric-card.component';
import {PageStateComponent} from './ui/page-state/page-state.component';
import {SectionHeadingComponent} from './ui/section-heading/section-heading.component';
import {SafeSpotifyUrlPipe} from './pipes/safe-spotify-url.pipe';
import {AccessibleDialogDirective} from './ui/accessible-dialog.directive';
import {ImageFallbackDirective} from './ui/image-fallback.directive';

const SHARED_MODULES = [
  CommonModule,
  FormsModule,
  RouterModule
];

@NgModule({
  imports: SHARED_MODULES,
  declarations: [MetricCardComponent, PageStateComponent, SectionHeadingComponent, SafeSpotifyUrlPipe, AccessibleDialogDirective, ImageFallbackDirective],
  exports: [...SHARED_MODULES, MetricCardComponent, PageStateComponent, SectionHeadingComponent, SafeSpotifyUrlPipe, AccessibleDialogDirective, ImageFallbackDirective]
})
export class SharedModule {}
