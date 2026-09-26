import {computed, Injectable, signal} from '@angular/core';
import {
  AmbientVector,
  ambientTargetForKey,
  ambientTargetWithScroll,
  normalizedScrollProgress
} from './ambient-background.math';

@Injectable()
export class AmbientBackgroundState {
  private readonly routeKeyState = signal('default');
  private readonly scrollProgressState = signal(0);
  private readonly reducedMotionState = signal(false);
  private readonly coarsePointerState = signal(false);
  private readonly pausedState = signal(false);

  readonly routeKey = this.routeKeyState.asReadonly();
  readonly scrollProgress = this.scrollProgressState.asReadonly();
  readonly reducedMotion = this.reducedMotionState.asReadonly();
  readonly coarsePointer = this.coarsePointerState.asReadonly();
  readonly paused = this.pausedState.asReadonly();
  readonly routeTarget = computed(() => ambientTargetForKey(this.routeKeyState()));
  readonly target = computed<AmbientVector>(() => {
    const route = this.routeTarget();
    if (this.reducedMotionState()) return ambientTargetWithScroll(route, .5, 0);
    return ambientTargetWithScroll(route, this.scrollProgressState(), this.coarsePointerState() ? .35 : 1);
  });

  setRouteKey(key: string): void { this.routeKeyState.set(key.trim() || 'default'); }
  setScrollMetrics(scrollTop: number, scrollHeight: number, viewportHeight: number): void {
    this.scrollProgressState.set(normalizedScrollProgress(scrollTop, scrollHeight, viewportHeight));
  }
  setReducedMotion(reduced: boolean): void { this.reducedMotionState.set(reduced); }
  setCoarsePointer(coarse: boolean): void { this.coarsePointerState.set(coarse); }
  setVisibility(hidden: boolean): void { this.pausedState.set(hidden); }
}
