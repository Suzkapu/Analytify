import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AmbientBackgroundComponent} from './ambient-background.component';

interface TestMediaQuery extends MediaQueryList {
  dispatch(matches: boolean): void;
}

const mediaQuery = (initial: boolean): TestMediaQuery => {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    media: '',
    get matches() { return matches; },
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener as (event: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    }),
    dispatchEvent: vi.fn(() => true),
    dispatch(value: boolean) {
      matches = value;
      for (const listener of listeners) listener({matches: value} as MediaQueryListEvent);
    }
  };
};

describe('AmbientBackgroundComponent', () => {
  let fixture: ComponentFixture<AmbientBackgroundComponent>;
  let reduced: TestMediaQuery;
  let coarse: TestMediaQuery;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let hidden: boolean;

  beforeEach(async () => {
    reduced = mediaQuery(false);
    coarse = mediaQuery(false);
    frames = new Map();
    nextFrame = 1;
    hidden = false;
    vi.stubGlobal('matchMedia', vi.fn((query: string) => query.includes('reduced-motion') ? reduced : coarse));
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    await TestBed.configureTestingModule({imports: [AmbientBackgroundComponent]}).compileComponents();
    fixture = TestBed.createComponent(AmbientBackgroundComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function runFrames(count = 1): void {
    for (let index = 0; index < count; index++) {
      const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!entry) return;
      frames.delete(entry[0]);
      entry[1]((index + 1) * 16);
    }
  }

  it('renders one decorative layer and smoothly updates the same instance for route changes', () => {
    fixture.componentRef.setInput('ambientKey', 'library');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const initial = element.style.getPropertyValue('--ambient-primary-x');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelectorAll('span').length).toBe(3);

    fixture.componentRef.setInput('ambientKey', 'insights');
    fixture.detectChanges();
    runFrames(30);
    expect(fixture.componentInstance).toBe(component);
    expect(element.style.getPropertyValue('--ambient-primary-x')).not.toBe(initial);
  });

  it('switches to a static target when reduced motion becomes active', () => {
    fixture.componentRef.setInput('ambientKey', 'social');
    fixture.detectChanges();
    expect(frames.size).toBeGreaterThan(0);
    reduced.dispatch(true);
    const element = fixture.nativeElement as HTMLElement;
    const staticValue = element.style.getPropertyValue('--ambient-primary-y');
    expect(fixture.componentInstance.state.reducedMotion()).toBe(true);
    expect(frames.size).toBe(0);

    window.dispatchEvent(new Event('scroll'));
    expect(element.style.getPropertyValue('--ambient-primary-y')).toBe(staticValue);
    expect(frames.size).toBe(0);
  });

  it('cancels animation while hidden and resumes with one frame when visible', () => {
    fixture.componentRef.setInput('ambientKey', 'library');
    fixture.detectChanges();
    expect(frames.size).toBe(1);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fixture.componentInstance.state.paused()).toBe(true);
    expect(frames.size).toBe(0);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fixture.componentInstance.state.paused()).toBe(false);
    expect(frames.size).toBe(1);
  });

  it('removes listeners and pending frames when destroyed', () => {
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    fixture.detectChanges();
    expect(frames.size).toBe(1);
    fixture.destroy();
    expect(frames.size).toBe(0);
    expect(removeWindow).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(reduced.removeEventListener).toHaveBeenCalled();
    expect(coarse.removeEventListener).toHaveBeenCalled();
  });
});
