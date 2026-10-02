import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';
import {PlaylistAnalysisController} from '../playlist-analysis/playlist-analysis.component';
import {V2AnalysisPageComponent} from './v2-analysis-page.component';

describe('V2AnalysisPageComponent', () => {
  it('notifies the view when asynchronous analysis loading finishes', async () => {
    const params = new Subject<Record<string, string>>();
    const markForCheck = vi.fn();
    const controller = new PlaylistAnalysisController({params} as any,
      {isAuthenticated: () => false} as any, {} as any, {} as any, {} as any,
      undefined, {markForCheck} as any);
    let finish!: () => void;
    vi.spyOn(controller, 'loadPlaylistData').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    controller.ngOnInit();
    params.next({id: 'playlist'});
    expect(markForCheck).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    expect(markForCheck).toHaveBeenCalledOnce();
    controller.ngOnDestroy();
  });
  it('maps each metric to its own current analysis value', () => {
    const component = Object.create(V2AnalysisPageComponent.prototype) as V2AnalysisPageComponent;
    Object.assign(component, {uniqueTracksCount: 12, uniqueArtistsCount: 7, uniqueAlbumsCount: 8,
      totalDurationFormatted: '41 hours', explicitCount: 3, averageDurationFormatted: '3:10'});
    expect(component.metrics.map(({label, value}) => ({label, value}))).toEqual([
      {label: 'Total songs', value: 12}, {label: 'Artists', value: 7}, {label: 'Albums', value: 8},
      {label: 'Total length', value: '41 hours'}, {label: 'Explicit', value: 3},
      {label: 'Average song length', value: '3:10'}
    ]);
    component.uniqueTracksCount = 0;
    expect(component.metrics[0].value).toBe(0);
  });
  it('keeps its back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2AnalysisPageComponent],
      providers: [provideRouter([])]
    }).overrideComponent(V2AnalysisPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2AnalysisPageComponent).componentInstance.backLink).toEqual(['/playlists']);
  });
});
