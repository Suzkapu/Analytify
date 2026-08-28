import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterModule} from '@angular/router';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {MetricCardComponent} from './ui/metric-card/metric-card.component';
import {PageStateComponent} from './ui/page-state/page-state.component';
import {SectionHeadingComponent} from './ui/section-heading/section-heading.component';

const SHARED_MODULES = [
  CommonModule,
  FormsModule,
  RouterModule,
  ButtonModule,
  InputTextModule
];

@NgModule({
  imports: SHARED_MODULES,
  declarations: [MetricCardComponent, PageStateComponent, SectionHeadingComponent],
  exports: [...SHARED_MODULES, MetricCardComponent, PageStateComponent, SectionHeadingComponent]
})
export class SharedModule {}
