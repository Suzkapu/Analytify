import {
  ambientPhaseForKey,
  ambientTargetForKey,
  ambientTargetWithScroll,
  ambientVectorsClose,
  dampAmbientValue,
  dampAmbientVector,
  normalizedScrollProgress
} from './ambient-background.math';

describe('ambient background math', () => {
  it('derives stable distinct normalized targets from semantic route keys', () => {
    expect(ambientPhaseForKey('library')).toBe(ambientPhaseForKey('library'));
    expect(ambientPhaseForKey('library')).not.toBe(ambientPhaseForKey('insights'));
    const target = ambientTargetForKey('library');
    expect(target).toEqual(ambientTargetForKey('library'));
    expect(target.primaryX).toBeGreaterThanOrEqual(0);
    expect(target.primaryX).toBeLessThanOrEqual(1);
    expect(target.secondaryY).toBeGreaterThanOrEqual(0);
    expect(target.secondaryY).toBeLessThanOrEqual(1);
  });

  it('normalizes scroll and safely handles short or invalid scroll ranges', () => {
    expect(normalizedScrollProgress(500, 2000, 1000)).toBe(.5);
    expect(normalizedScrollProgress(-50, 2000, 1000)).toBe(0);
    expect(normalizedScrollProgress(5000, 2000, 1000)).toBe(1);
    expect(normalizedScrollProgress(100, 800, 1000)).toBe(0);
    expect(normalizedScrollProgress(100, 0, 0)).toBe(0);
  });

  it('blends subtle scroll offsets without mutating the route target', () => {
    const route = ambientTargetForKey('social');
    const copy = {...route};
    const top = ambientTargetWithScroll(route, 0);
    const bottom = ambientTargetWithScroll(route, 1);
    expect(route).toEqual(copy);
    expect(top).not.toEqual(bottom);
    expect(Math.abs(bottom.primaryY - top.primaryY)).toBeLessThanOrEqual(.11);
    expect(ambientTargetWithScroll(route, 1, 0)).toEqual(ambientTargetWithScroll(route, 0, 0));
  });

  it('damps deterministically toward a target and caps long frame gaps', () => {
    expect(dampAmbientValue(0, 1, 0)).toBe(0);
    const first = dampAmbientValue(0, 1, 16);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    expect(dampAmbientValue(0, 1, 1000)).toBe(dampAmbientValue(0, 1, 64));
    const current = ambientTargetForKey('library');
    const target = ambientTargetForKey('insights');
    expect(dampAmbientVector(current, target, 16)).not.toEqual(current);
    expect(ambientVectorsClose(target, {...target})).toBe(true);
    expect(ambientVectorsClose(current, target)).toBe(false);
  });
});
