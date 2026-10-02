import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy
} from '@angular/core';
import {AmbientOverlayState, AmbientShellMode, AmbientVector, ambientVectorsClose, dampAmbientVector} from './ambient-background.math';
import {AmbientBackgroundState} from './ambient-background.state';

@Component({
  selector: 'app-ambient-background',
  standalone: true,
  template: '<span class="ambient-primary"></span><span class="ambient-secondary"></span><span class="ambient-dots"></span>',
  styleUrls: ['./ambient-background.component.scss'],
  providers: [AmbientBackgroundState],
  host: {'aria-hidden': 'true'},
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AmbientBackgroundComponent implements AfterViewInit, OnDestroy {
  private viewReady = false;
  private frameId: number | null = null;
  private lastFrame = 0;
  private scrollMetricsPending = false;
  private current: AmbientVector;
  private reducedMotionQuery?: MediaQueryList;
  private coarsePointerQuery?: MediaQueryList;

  @Input() set ambientKey(key: string) {
    this.state.setRouteKey(key);
    this.targetChanged();
  }
  @Input() set overlayState(overlay: AmbientOverlayState) { this.state.setOverlayState(overlay); this.targetChanged(); }
  @Input() set shellMode(mode: AmbientShellMode) { this.state.setShellMode(mode); this.targetChanged(); }

  private readonly scrollHandler = (): void => {
    this.scrollMetricsPending = true;
    this.scheduleFrame();
  };
  private readonly visibilityHandler = (): void => {
    this.state.setVisibility(document.hidden);
    if (document.hidden) this.cancelFrame();
    else this.scrollHandler();
  };
  private readonly reducedMotionHandler = (event: MediaQueryListEvent): void => {
    this.state.setReducedMotion(event.matches);
    if (event.matches) {
      this.cancelFrame();
      this.current = this.state.target();
      this.render(this.current);
    } else this.scrollHandler();
  };
  private readonly coarsePointerHandler = (event: MediaQueryListEvent): void => {
    this.state.setCoarsePointer(event.matches);
    this.scheduleFrame();
  };

  constructor(
    private readonly element: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    readonly state: AmbientBackgroundState
  ) {
    this.current = state.target();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.zone.runOutsideAngular(() => {
      this.reducedMotionQuery = this.mediaQuery('(prefers-reduced-motion: reduce)');
      this.coarsePointerQuery = this.mediaQuery('(pointer: coarse)');
      this.state.setReducedMotion(this.reducedMotionQuery.matches);
      this.state.setCoarsePointer(this.coarsePointerQuery.matches);
      this.state.setVisibility(document.hidden);
      this.scrollHandler();
      this.reducedMotionQuery.addEventListener('change', this.reducedMotionHandler);
      this.coarsePointerQuery.addEventListener('change', this.coarsePointerHandler);
      window.addEventListener('scroll', this.scrollHandler, {passive: true});
      window.addEventListener('resize', this.scrollHandler, {passive: true});
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.current = this.state.target();
      this.render(this.current);
    });
  }

  ngOnDestroy(): void {
    this.cancelFrame();
    window.removeEventListener('scroll', this.scrollHandler);
    window.removeEventListener('resize', this.scrollHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.reducedMotionQuery?.removeEventListener('change', this.reducedMotionHandler);
    this.coarsePointerQuery?.removeEventListener('change', this.coarsePointerHandler);
  }

  private scheduleFrame(): void {
    if (!this.viewReady || this.state.paused() || this.state.reducedMotion() || this.frameId !== null) return;
    this.frameId = this.zone.runOutsideAngular(() => window.requestAnimationFrame(time => this.animate(time)));
  }

  private animate(time: number): void {
    this.frameId = null;
    if (this.state.paused() || this.state.reducedMotion()) return;
    if (this.scrollMetricsPending) {
      this.scrollMetricsPending = false;
      this.state.setScrollMetrics(window.scrollY, document.documentElement.scrollHeight, window.innerHeight);
    }
    const delta = this.lastFrame ? time - this.lastFrame : 16;
    this.lastFrame = time;
    const target = this.state.target();
    this.current = dampAmbientVector(this.current, target, delta);
    this.render(this.current);
    if (!ambientVectorsClose(this.current, target)) this.scheduleFrame();
    else this.lastFrame = 0;
  }

  private render(value: AmbientVector): void {
    const style = this.element.nativeElement.style;
    style.setProperty('--ambient-primary-x', `${(value.primaryX * 100).toFixed(2)}%`);
    style.setProperty('--ambient-primary-y', `${(value.primaryY * 100).toFixed(2)}%`);
    style.setProperty('--ambient-secondary-x', `${(value.secondaryX * 100).toFixed(2)}%`);
    style.setProperty('--ambient-secondary-y', `${(value.secondaryY * 100).toFixed(2)}%`);
    style.setProperty('--ambient-dots-x', `${(value.dotsX * 22).toFixed(2)}px`);
    style.setProperty('--ambient-dots-y', `${(value.dotsY * 22).toFixed(2)}px`);
    style.setProperty('--ambient-intensity', value.intensity.toFixed(3));
    style.setProperty('--ambient-dot-intensity', value.dotIntensity.toFixed(3));
  }

  private targetChanged(): void {
    if (!this.viewReady) return;
    if (this.state.reducedMotion()) {
      this.current = this.state.target();
      this.render(this.current);
      return;
    }
    this.scheduleFrame();
  }

  private cancelFrame(): void {
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.lastFrame = 0;
  }

  private mediaQuery(query: string): MediaQueryList {
    if (typeof window.matchMedia === 'function') return window.matchMedia(query);
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true
    };
  }
}
