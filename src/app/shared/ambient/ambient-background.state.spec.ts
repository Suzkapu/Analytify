import {TestBed} from '@angular/core/testing';
import {AmbientBackgroundState} from './ambient-background.state';

describe('AmbientBackgroundState', () => {
  let state: AmbientBackgroundState;
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [AmbientBackgroundState]});
    state = TestBed.inject(AmbientBackgroundState);
  });

  it('updates a route target without recreating the state object', () => {
    const reference = state;
    state.setRouteKey('library');
    const library = state.routeTarget();
    state.setRouteKey('insights');
    expect(state).toBe(reference);
    expect(state.routeTarget()).not.toEqual(library);
    expect(state.routeKey()).toBe('insights');
  });

  it('uses scroll progress, with reduced movement for coarse pointers', () => {
    state.setRouteKey('social');
    state.setScrollMetrics(1000, 2000, 1000);
    const fullMotion = state.target();
    state.setCoarsePointer(true);
    const coarseMotion = state.target();
    const route = state.routeTarget();
    expect(Math.abs(coarseMotion.primaryY - route.primaryY)).toBeLessThan(Math.abs(fullMotion.primaryY - route.primaryY));
  });

  it('keeps reduced-motion output static regardless of scroll', () => {
    state.setRouteKey('library');
    state.setReducedMotion(true);
    state.setScrollMetrics(0, 2000, 1000);
    const top = state.target();
    state.setScrollMetrics(1000, 2000, 1000);
    expect(state.target()).toEqual(top);
  });

  it('tracks pause and resume when page visibility changes', () => {
    state.setVisibility(true);
    expect(state.paused()).toBe(true);
    state.setVisibility(false);
    expect(state.paused()).toBe(false);
  });
});
