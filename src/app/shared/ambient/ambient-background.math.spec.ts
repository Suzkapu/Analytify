import {
  ambientTargetForKey,
  ambientTargetWithInteraction,
  ambientTargetWithScroll,
  ambientVectorsClose,
  dampAmbientValue,
  dampAmbientVector,
  normalizedScrollProgress
} from './ambient-background.math';

describe('ambient background math', () => {
  it('normalizes canonical scene aliases and uses Library for account/admin/unknown keys', () => {
    const library = ambientTargetForKey('library');
    for (const key of ['', '  ', ' LIBRARY ', 'default', 'account', 'admin', 'unknown', 'constructor', '__proto__']) expect(ambientTargetForKey(key)).toEqual(library);
  });

  it('uses the canonical normalized glow centers for every desktop scene', () => {
    for (const [key, centers] of [
      ['library', [.25, .15, .84, .58]], ['insights', [.68, .3, .16, .72]],
      ['social', [.4, .76, .83, .22]], ['league', [1120 / 1440, 145 / 810, 210 / 1440, 695 / 810]]
    ] as const) {
      const target = ambientTargetForKey(key);
      for (const [index, property] of (['primaryX', 'primaryY', 'secondaryX', 'secondaryY'] as const).entries()) expect(target[property]).toBeCloseTo(centers[index], 7);
    }
  });

  it('preserves canonical particle positions at page top across route changes', () => {
    for (const key of ['library', 'insights', 'social', 'league', 'login']) {
      const route = ambientTargetForKey(key);
      expect(route.dotsX).toBe(0);
      expect(route.dotsY).toBe(0);
      const top = ambientTargetWithScroll(route, 0);
      expect(top.dotsX).toBe(0);
      expect(top.dotsY).toBe(0);
    }
  });

  it('normalizes scroll and safely handles short or invalid scroll ranges', () => {
    expect(normalizedScrollProgress(500, 2000, 1000)).toBe(.5);
    expect(normalizedScrollProgress(-50, 2000, 1000)).toBe(0);
    expect(normalizedScrollProgress(5000, 2000, 1000)).toBe(1);
    expect(normalizedScrollProgress(100, 800, 1000)).toBe(0);
    expect(normalizedScrollProgress(100, 0, 0)).toBe(0);
  });

  it('moves only particles on scroll and preserves the canonical route glow coordinates', () => {
    const route = ambientTargetForKey('social');
    const copy = {...route};
    const top = ambientTargetWithScroll(route, 0);
    const bottom = ambientTargetWithScroll(route, 1);
    expect(route).toEqual(copy);
    expect(top).not.toEqual(bottom);
    for (const key of ['primaryX', 'primaryY', 'secondaryX', 'secondaryY'] as const) {
      expect(top[key]).toBe(route[key]);
      expect(bottom[key]).toBe(route[key]);
    }
    expect(bottom.dotsY).not.toBe(top.dotsY);
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

  it('composes deterministic overlay depth without moving route glows, and shell mode intensity', () => {
    const route = ambientTargetForKey('library');
    const tools = ambientTargetWithInteraction(route, 'tools', 'app');
    const account = ambientTargetWithInteraction(route, 'account', 'app');
    const modal = ambientTargetWithInteraction(route, 'modal', 'app');
    expect(tools).toEqual(ambientTargetWithInteraction(route, 'tools', 'app'));
    for (const overlay of [tools, account, modal]) {
      for (const key of ['primaryX', 'primaryY', 'secondaryX', 'secondaryY'] as const) expect(overlay[key]).toBe(route[key]);
    }
    expect(tools.dotsX).toBeLessThan(route.dotsX);
    expect(account.dotsX).toBeGreaterThan(route.dotsX);
    expect(modal.intensity).toBeLessThan(tools.intensity);
    expect(ambientTargetWithInteraction(route, 'none', 'focus').intensity).toBeLessThan(route.intensity);
    expect(route).toEqual(ambientTargetForKey('library'));
  });
});
