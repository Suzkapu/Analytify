import {afterEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {RankHistoryCategory, RankHistoryPosition, V2RankHistoryPlotComponent} from './v2-rank-history-plot.component';

describe('Saved rank history plot', () => {
  const position = (day: number, rank: number) => ({timestamp: new Date(2026, 8, day, 12).getTime(), rank});
  const samples = [position(5, 15), position(9, 4), position(14, 45), position(18, 20), position(24, 90), position(28, 60), position(30, 3)];
  afterEach(() => {TestBed.resetTestingModule(); vi.unstubAllGlobals();});
  async function render(points: RankHistoryPosition[] = samples, category: RankHistoryCategory = 'tracks') {
    await TestBed.configureTestingModule({imports: [V2RankHistoryPlotComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2RankHistoryPlotComponent);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('category', category);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const slider = () => element.querySelector<HTMLElement>('[role="slider"]')!;
    const key = (value: string) => {
      const event = new KeyboardEvent('keydown', {key: value, bubbles: true, cancelable: true});
      slider().dispatchEvent(event); fixture.detectChanges(); return event;
    };
    return {fixture, element, slider, key};
  }

  it.each([
    ['tracks', 100, ['#1', '#50', '#100']],
    ['artists', 50, ['#1', '#25', '#50']],
    ['genres', 15, ['#1', '#8', '#15']]
  ] as const)('places rank1 at the top and the %s limit at the bottom', async (category, limit, labels) => {
    const {element} = await render([position(5, 1), position(30, limit)], category);
    expect([...element.querySelectorAll('.axis-label')].map(n => n.textContent?.trim())).toEqual(labels);
    const markers = element.querySelectorAll('circle.position-marker');
    expect(markers[0].getAttribute('cx')).toBe('32');
    expect(markers[0].getAttribute('cy')).toBe('40');
    expect(markers[1].getAttribute('cx')).toBe('488');
    expect(markers[1].getAttribute('cy')).toBe('204');
    expect(element.querySelector('.history-line')?.getAttribute('d')).toBe('M 32,40 L 488,204');
    expect(element.querySelector('.history-area')?.getAttribute('d')).toBe('M 32,40 L 488,204 L 488,204 L 32,204 Z');
  });

  it.each([
    ['tracks', 50, 100], ['artists', 25, 50], ['genres', 8, 15]
  ] as const)('aligns the labelled middle %s grid with the corresponding actual rank', async (category, rank, limit) => {
    const {fixture, element} = await render([position(5, 1), position(18, rank), position(30, limit)], category);
    for (const height of [248, 232]) {
      fixture.componentInstance.height.set(height); fixture.detectChanges();
      const grid = element.querySelectorAll('.grid-line')[1];
      const point = element.querySelectorAll('.position-marker')[1];
      const label = element.querySelectorAll('.axis-label')[1];
      expect(Number(grid.getAttribute('y1'))).toBeCloseTo(Number(point.getAttribute('cy')), 10);
      expect(Number(grid.getAttribute('y2'))).toBeCloseTo(Number(point.getAttribute('cy')), 10);
      expect(Number(label.getAttribute('y')) - 8).toBeCloseTo(Number(point.getAttribute('cy')), 10);
      expect(label.textContent?.trim()).toBe(`#${rank}`);
    }
  });

  it.each([0, 1])('ignores queued plot inspection after refreshed data leaves %s positions', async count => {
    const {fixture, slider} = await render();
    const oldCanvas = slider(); oldCanvas.focus();
    vi.spyOn(oldCanvas, 'getBoundingClientRect').mockReturnValue({left: 100, width: 512} as DOMRect);
    const selected = fixture.componentInstance.selected();
    // Inputs update before Angular removes the old canvas in the next render.
    fixture.componentRef.setInput('points', samples.slice(0, count));
    expect(() => fixture.componentInstance.inspectFirst()).not.toThrow();
    const event = new KeyboardEvent('keydown', {key: 'End', cancelable: true});
    expect(() => fixture.componentInstance.inspectKey(event)).not.toThrow();
    expect(event.defaultPrevented).toBe(false);
    const pointer = new MouseEvent('click', {clientX: 360});
    Object.defineProperty(pointer, 'currentTarget', {value: oldCanvas});
    expect(() => fixture.componentInstance.inspectPointer(pointer, true)).not.toThrow();
    expect(fixture.componentInstance.selected()).toBe(selected);
    fixture.detectChanges();
    expect(slider()).toBeNull();
  });

  it.each([{points: []}, {points: [position(18, 3)]}])('does not fabricate a plot for fewer than two positions: %j', async ({points}) => {
    const {element, fixture} = await render(points);
    expect(element.querySelector('svg')).toBeNull();
    expect(element.querySelector('[role="slider"]')).toBeNull();
    expect(fixture.componentInstance.line()).toBe('');
    expect(fixture.componentInstance.area()).toBe('');
    expect(fixture.componentInstance.activeDescription()).toBe(points.length ? '18 Sep 2026, position 3' : '');
  });

  it('keeps corrupt dates and out-of-range/noninteger ranks out of the plotted history', async () => {
    const invalid = [position(1, 0), position(2, -1), position(3, 51), position(4, 1.5),
      {timestamp: NaN, rank: 1}, {timestamp: 1e20, rank: 1}, {timestamp: position(5, 1).timestamp, rank: Infinity}];
    const {element, slider} = await render([...invalid, position(18, 3), position(30, 50)], 'artists');
    expect(element.querySelectorAll('.position-marker')).toHaveLength(2);
    expect(slider().getAttribute('aria-valuemax')).toBe('2');
    expect(slider().getAttribute('aria-valuetext')).toBe('18 Sep 2026, position 3');
    expect(element.querySelector('.history-line')?.getAttribute('d')).not.toContain('NaN');
  });

  it('inspects every date with arrows/Home/End and announces the actual rank without moving past boundaries', async () => {
    const {element, slider, key} = await render();
    slider().focus();
    expect(key('ArrowLeft').defaultPrevented).toBe(true);
    expect(slider().getAttribute('aria-valuetext')).toBe('5 Sep 2026, position 15');
    key('ArrowRight');
    expect(slider().getAttribute('aria-valuetext')).toBe('9 Sep 2026, position 4');
    key('End'); key('ArrowRight');
    expect(slider().getAttribute('aria-valuenow')).toBe('7');
    expect(element.querySelector('[aria-live]')?.textContent?.trim()).toBe('30 Sep 2026, position 3');
    expect(element.querySelector('.inspection-ring')?.getAttribute('r')).toBe('22');
    expect(element.querySelectorAll('.position-marker[r="5"]')).toHaveLength(1);
    key('Home');
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    expect(key('Escape').defaultPrevented).toBe(false);
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
  });

  it('samples dense labels while retaining all50 positions for keyboard inspection', async () => {
    const points = Array.from({length: 50}, (_, index) => position(index + 1, index + 1));
    const {element, slider, key} = await render(points);
    expect(element.querySelectorAll('.position-marker')).toHaveLength(50);
    expect(element.querySelectorAll('.date-label')).toHaveLength(6);
    key('End');
    expect(slider().getAttribute('aria-valuetext')).toBe('20 Oct 2026, position 50');
    key('ArrowLeft');
    expect(slider().getAttribute('aria-valuetext')).toBe('19 Oct 2026, position 49');
  });

  it('preserves the inspected date when earlier positions arrive and safely moves to a remaining date if it is removed', async () => {
    const {fixture, slider, key} = await render([position(18, 3), position(30, 4)]);
    key('End');
    fixture.componentRef.setInput('points', [position(5, 9), position(18, 3), position(30, 2)]); fixture.detectChanges();
    expect(slider().getAttribute('aria-valuetext')).toBe('30 Sep 2026, position 2');
    expect(slider().getAttribute('aria-valuenow')).toBe('3');
    fixture.componentRef.setInput('points', [position(5, 9), position(18, 3)]); fixture.detectChanges();
    expect(slider().getAttribute('aria-valuetext')).toBe('18 Sep 2026, position 3');
    fixture.componentRef.setInput('points', [position(5, 9), position(31, 1)]); fixture.detectChanges();
    expect(slider().getAttribute('aria-valuetext')).toBe('1 Oct 2026, position 1');
  });

  it('inspects the nearest pointer date, clamps outside edges and retains the selected date when focusing after a tap', async () => {
    const {fixture, slider} = await render();
    vi.spyOn(slider(), 'getBoundingClientRect').mockReturnValue({left: 100, width: 512} as DOMRect);
    slider().dispatchEvent(new MouseEvent('pointermove', {clientX: 360, bubbles: true})); fixture.detectChanges();
    expect(slider().getAttribute('aria-valuetext')).toBe('18 Sep 2026, position 20');
    expect(document.activeElement).not.toBe(slider());
    slider().dispatchEvent(new MouseEvent('click', {clientX: 1000, bubbles: true})); fixture.detectChanges();
    expect(document.activeElement).toBe(slider());
    expect(slider().getAttribute('aria-valuenow')).toBe('7');
    slider().dispatchEvent(new MouseEvent('pointermove', {clientX: 0, bubbles: true})); fixture.detectChanges();
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
    vi.spyOn(slider(), 'getBoundingClientRect').mockReturnValue({left: 0, width: 0} as DOMRect);
    slider().dispatchEvent(new MouseEvent('click', {clientX: 300, bubbles: true})); fixture.detectChanges();
    expect(slider().getAttribute('aria-valuenow')).toBe('1');
  });

  it('recomputes mobile geometry without stretching text or marker size, and disconnects obsolete observations', async () => {
    const observers: Array<{callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>}> = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn(); disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {observers.push({callback, observe: this.observe, disconnect: this.disconnect});}
    });
    const {fixture, element, slider} = await render();
    const resize = (index: number, width: number, height: number) => {
      observers[index].callback([{contentRect: {width, height}}] as ResizeObserverEntry[], {} as ResizeObserver);
      fixture.detectChanges();
    };
    expect(observers[0].observe).toHaveBeenCalledWith(slider());
    resize(0, 310, 232);
    expect(element.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 310 232');
    expect(element.querySelectorAll('.date-label')).toHaveLength(4);
    expect(element.querySelector('.position-marker')?.getAttribute('r')).toBe('3');
    resize(0, 0, 0);
    expect(element.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 310 232');
    fixture.componentRef.setInput('points', []); fixture.detectChanges();
    expect(observers[0].disconnect).toHaveBeenCalled();
    fixture.componentRef.setInput('points', samples); fixture.detectChanges();
    expect(observers).toHaveLength(2);
    resize(0, 900, 900);
    expect(element.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 310 232');
    resize(1, 512, 248);
    expect(element.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 512 248');
    fixture.destroy();
    expect(observers[1].disconnect).toHaveBeenCalled();
    observers[1].callback([{contentRect: {width: 900, height: 900}}] as ResizeObserverEntry[], {} as ResizeObserver);
    expect(fixture.componentInstance.width()).toBe(512);
  });
});
