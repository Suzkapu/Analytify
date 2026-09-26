import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {DESIGN_VARIANT} from '@core/navigation/design-navigation';
import {V2AnalysisPageComponent} from './v2-analysis-page.component';

describe('V2AnalysisPageComponent', () => {
  it('keeps its back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2AnalysisPageComponent],
      providers: [
        {provide: DESIGN_VARIANT, useValue: 'new'},
        {provide: Router, useValue: {navigate: vi.fn(), createUrlTree: vi.fn()}}
      ]
    }).overrideComponent(V2AnalysisPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2AnalysisPageComponent).componentInstance.backLink).toEqual(['/new', 'playlists']);
  });
});
