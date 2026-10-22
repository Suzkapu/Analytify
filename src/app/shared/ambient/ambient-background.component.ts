import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  untracked
} from '@angular/core';
import {AmbientOverlayState, AmbientShellMode, AmbientVector, ambientVectorsClose, dampAmbientVector} from './ambient-background.math';
import {AmbientBackgroundState} from './ambient-background.state';

@Component({
  selector: 'app-ambient-background',
  standalone: true,
  template: `
    <span class="ambient-primary"><picture>
      <source media="(max-width: 760px)" srcset="assets/design-v2/ambient-green-mobile.svg">
      <img src="assets/design-v2/ambient-green-desktop.svg" alt="">
    </picture></span>
    <span class="ambient-secondary"><picture>
      <source media="(max-width: 760px)" srcset="assets/design-v2/ambient-blue-mobile.svg">
      <img src="assets/design-v2/ambient-blue-desktop.svg" alt="">
    </picture></span>
    <span class="ambient-dots">
      @for (dot of particles; track $index) {
        <span class="ambient-dot"
          [style.--ambient-a-x]="dot.aX" [style.--ambient-a-y]="dot.aY"
          [style.--ambient-b-x]="dot.bX" [style.--ambient-b-y]="dot.bY"
          [style.--ambient-c-x]="dot.cX" [style.--ambient-c-y]="dot.cY"
          [style.--ambient-dot-size]="dot.size" [style.--ambient-dot-opacity]="dot.opacity"
          [style.--ambient-dot-mobile-opacity]="dot.mobileOpacity"></span>
      }
    </span>`,
  styleUrls: ['./ambient-background.component.scss'],
  providers: [AmbientBackgroundState],
  host: {'aria-hidden': 'true'},
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AmbientBackgroundComponent implements AfterViewInit, OnDestroy {
  // Canonical 266:18224 A/B/C ellipse coordinates, normalized to the viewport.
  // Scenes share these tracks. CSS preserves one timeline through input changes.
  readonly particles = [
    {aX: '17.000000vw', aY: '23.958333vh', bX: '41.000001vw', bY: '39.958335vh', cX: '70.000000vw', cY: '57.958332vh', size: '2px', opacity: 0.16, mobileOpacity: 0.13},
    {aX: '53.999999vw', aY: '85.416667vh', bX: '77.999997vw', bY: '1.416667vh', cX: '7.000000vw', cY: '19.416665vh', size: '3px', opacity: 0.185, mobileOpacity: 0.155},
    {aX: '91.000001vw', aY: '45.833333vh', bX: '15.000000vw', bY: '61.833335vh', cX: '43.999999vw', cY: '79.833336vh', size: '2px', opacity: 0.21, mobileOpacity: 0.18},
    {aX: '26.999999vw', aY: '6.250000vh', bX: '51.000001vw', bY: '22.250001vh', cX: '80.000000vw', cY: '40.249999vh', size: '4px', opacity: 0.235, mobileOpacity: 0.13},
    {aX: '63.999999vw', aY: '67.708333vh', bX: '87.999997vw', bY: '83.708331vh', cX: '17.000000vw', cY: '1.708333vh', size: '2px', opacity: 0.16, mobileOpacity: 0.155},
    {aX: '0.000000vw', aY: '28.125000vh', bX: '24.000001vw', bY: '44.125001vh', cX: '53.000001vw', cY: '62.124999vh', size: '2px', opacity: 0.185, mobileOpacity: 0.18},
    {aX: '36.999999vw', aY: '89.583333vh', bX: '61.000001vw', bY: '5.583333vh', cX: '90.000000vw', cY: '23.583332vh', size: '3px', opacity: 0.21, mobileOpacity: 0.13},
    {aX: '73.999999vw', aY: '50.000000vh', bX: '97.999997vw', bY: '65.999998vh', cX: '26.999999vw', cY: '84.000002vh', size: '2px', opacity: 0.235, mobileOpacity: 0.155},
    {aX: '10.000000vw', aY: '10.416667vh', bX: '34.000001vw', bY: '26.416668vh', cX: '63.000001vw', cY: '44.416665vh', size: '4px', opacity: 0.16, mobileOpacity: 0.18},
    {aX: '46.999999vw', aY: '71.875000vh', bX: '71.000001vw', bY: '87.874998vh', cX: '0.000000vw', cY: '5.875000vh', size: '2px', opacity: 0.185, mobileOpacity: 0.13},
    {aX: '83.999999vw', aY: '32.291667vh', bX: '8.000000vw', bY: '48.291668vh', cX: '36.999999vw', cY: '66.291669vh', size: '2px', opacity: 0.21, mobileOpacity: 0.155},
    {aX: '20.000000vw', aY: '93.750000vh', bX: '43.999999vw', bY: '9.750000vh', cX: '72.999997vw', cY: '27.749999vh', size: '3px', opacity: 0.235, mobileOpacity: 0.18},
    {aX: '56.999999vw', aY: '54.166667vh', bX: '81.000001vw', bY: '70.166664vh', cX: '10.000000vw', cY: '88.166669vh', size: '2px', opacity: 0.16, mobileOpacity: 0},
    {aX: '93.999999vw', aY: '14.583333vh', bX: '18.000001vw', bY: '30.583335vh', cX: '46.999999vw', cY: '48.583332vh', size: '4px', opacity: 0.185, mobileOpacity: 0},
    {aX: '30.000000vw', aY: '76.041667vh', bX: '53.999999vw', bY: '92.041664vh', cX: '82.999997vw', cY: '10.041667vh', size: '2px', opacity: 0.21, mobileOpacity: 0},
    {aX: '66.999999vw', aY: '36.458333vh', bX: '91.000001vw', bY: '52.458335vh', cX: '20.000000vw', cY: '70.458336vh', size: '2px', opacity: 0.235, mobileOpacity: 0},
    {aX: '3.000000vw', aY: '97.916667vh', bX: '26.999999vw', bY: '13.916667vh', cX: '56.000001vw', cY: '31.916665vh', size: '3px', opacity: 0.16, mobileOpacity: 0},
    {aX: '40.000000vw', aY: '58.333333vh', bX: '63.999999vw', bY: '74.333331vh', cX: '92.999997vw', cY: '92.333336vh', size: '2px', opacity: 0.185, mobileOpacity: 0},
    {aX: '77.000003vw', aY: '18.750000vh', bX: '1.000000vw', bY: '34.750001vh', cX: '30.000000vw', cY: '52.749999vh', size: '4px', opacity: 0.21, mobileOpacity: 0},
    {aX: '13.000000vw', aY: '80.208333vh', bX: '36.999999vw', bY: '96.208331vh', cX: '66.000001vw', cY: '14.208333vh', size: '2px', opacity: 0.235, mobileOpacity: 0},
    {aX: '50.000000vw', aY: '40.625000vh', bX: '73.999999vw', bY: '56.625001vh', cX: '3.000000vw', cY: '74.625002vh', size: '2px', opacity: 0.16, mobileOpacity: 0},
    {aX: '87.000003vw', aY: '1.041667vh', bX: '10.999999vw', bY: '17.041668vh', cX: '40.000000vw', cY: '35.041665vh', size: '3px', opacity: 0.185, mobileOpacity: 0},
    {aX: '23.000001vw', aY: '62.500000vh', bX: '46.999999vw', bY: '78.499998vh', cX: '76.000001vw', cY: '96.500002vh', size: '2px', opacity: 0.21, mobileOpacity: 0},
    {aX: '60.000000vw', aY: '22.916667vh', bX: '83.999999vw', bY: '38.916668vh', cX: '13.000000vw', cY: '56.916665vh', size: '4px', opacity: 0.235, mobileOpacity: 0},
    {aX: '97.000003vw', aY: '84.375000vh', bX: '20.999999vw', bY: '0.375000vh', cX: '50.000000vw', cY: '18.374999vh', size: '2px', opacity: 0.16, mobileOpacity: 0},
    {aX: '33.000001vw', aY: '44.791667vh', bX: '56.999999vw', bY: '60.791668vh', cX: '86.000001vw', cY: '78.791669vh', size: '2px', opacity: 0.185, mobileOpacity: 0},
  ];
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
  private readonly resizeHandler = (): void => untracked(() => {
    this.state.setViewportWidth(window.innerWidth);
    this.current = this.state.target();
    this.render(this.current);
    this.scrollHandler();
  });
  // Native events can interrupt a template/computed read. Keep their writes
  // outside that interrupted reactive consumer without delaying pause/resume.
  private readonly visibilityHandler = (): void => untracked(() => {
    this.state.setVisibility(document.hidden);
    this.updateParticlePlayback();
    if (document.hidden) this.cancelFrame();
    else this.scrollHandler();
  });
  private readonly reducedMotionHandler = (event: MediaQueryListEvent): void => untracked(() => {
    this.state.setReducedMotion(event.matches);
    if (event.matches) {
      this.cancelFrame();
      this.current = this.state.target();
      this.render(this.current);
    } else this.scrollHandler();
  });
  private readonly coarsePointerHandler = (event: MediaQueryListEvent): void => untracked(() => {
    this.state.setCoarsePointer(event.matches);
    this.scheduleFrame();
  });

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
      this.state.setViewportWidth(window.innerWidth);
      this.state.setVisibility(document.hidden);
      this.scrollHandler();
      this.reducedMotionQuery.addEventListener('change', this.reducedMotionHandler);
      this.coarsePointerQuery.addEventListener('change', this.coarsePointerHandler);
      window.addEventListener('scroll', this.scrollHandler, {passive: true});
      window.addEventListener('resize', this.resizeHandler, {passive: true});
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.current = this.state.target();
      this.render(this.current);
    });
  }

  ngOnDestroy(): void {
    this.cancelFrame();
    window.removeEventListener('scroll', this.scrollHandler);
    window.removeEventListener('resize', this.resizeHandler);
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
    const settled = ambientVectorsClose(this.current, target);
    if (settled) this.current = target;
    this.render(this.current);
    if (!settled) this.scheduleFrame();
    else this.lastFrame = 0;
  }

  private render(value: AmbientVector): void {
    this.updateParticlePlayback();
    const style = this.element.nativeElement.style;
    style.setProperty('--ambient-primary-x', `${(value.primaryX * 100).toFixed(4)}%`);
    style.setProperty('--ambient-primary-y', `${(value.primaryY * 100).toFixed(4)}%`);
    style.setProperty('--ambient-secondary-x', `${(value.secondaryX * 100).toFixed(4)}%`);
    style.setProperty('--ambient-secondary-y', `${(value.secondaryY * 100).toFixed(4)}%`);
    style.setProperty('--ambient-dots-x', `${(value.dotsX * 22).toFixed(2)}px`);
    style.setProperty('--ambient-dots-y', `${(value.dotsY * 22).toFixed(2)}px`);
    style.setProperty('--ambient-intensity', value.intensity.toFixed(3));
    style.setProperty('--ambient-dot-intensity', value.dotIntensity.toFixed(3));
  }

  private updateParticlePlayback(): void {
    this.element.nativeElement.style.setProperty('--ambient-particle-play-state', this.state.paused() ? 'paused' : 'running');
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
