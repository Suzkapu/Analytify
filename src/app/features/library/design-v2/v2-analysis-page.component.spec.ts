import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {describe, expect, it} from 'vitest';
import {V2AnalysisPageComponent} from './v2-analysis-page.component';

describe('V2AnalysisPageComponent', () => {
  it('keeps its back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2AnalysisPageComponent],
      providers: [provideRouter([])]
    }).overrideComponent(V2AnalysisPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2AnalysisPageComponent).componentInstance.backLink).toEqual(['/playlists']);
  });
});
