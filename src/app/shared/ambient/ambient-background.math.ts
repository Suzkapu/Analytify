export interface AmbientVector {
  primaryX: number;
  primaryY: number;
  secondaryX: number;
  secondaryY: number;
  dotsX: number;
  dotsY: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Stable FNV-1a based phase. Semantic route keys are inputs, never coordinate lookups. */
export const ambientPhaseForKey = (key: string): number => {
  let hash = 2166136261;
  for (const character of key.trim().toLocaleLowerCase() || 'default') {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
};

export const ambientTargetForKey = (key: string): AmbientVector => {
  const phase = ambientPhaseForKey(key) * Math.PI * 2;
  return {
    primaryX: clamp01(.28 + Math.sin(phase) * .16),
    primaryY: clamp01(.18 + Math.cos(phase * 1.17) * .12),
    secondaryX: clamp01(.72 + Math.cos(phase * .83) * .16),
    secondaryY: clamp01(.42 + Math.sin(phase * 1.31) * .16),
    dotsX: Math.sin(phase * .67) * .5,
    dotsY: Math.cos(phase * .71) * .5
  };
};

export const normalizedScrollProgress = (
  scrollTop: number,
  scrollHeight: number,
  viewportHeight: number
): number => {
  const available = Math.max(0, scrollHeight - viewportHeight);
  if (available === 0) return 0;
  return clamp01(scrollTop / available);
};

export const ambientTargetWithScroll = (
  route: AmbientVector,
  progress: number,
  motionScale = 1
): AmbientVector => {
  const centered = (clamp01(progress) - .5) * Math.min(1, Math.max(0, motionScale));
  return {
    primaryX: clamp01(route.primaryX + centered * .035),
    primaryY: clamp01(route.primaryY + centered * .1),
    secondaryX: clamp01(route.secondaryX - centered * .045),
    secondaryY: clamp01(route.secondaryY + centered * .07),
    dotsX: route.dotsX + centered * 1.8,
    dotsY: route.dotsY - centered * 2.4
  };
};

export const dampAmbientValue = (current: number, target: number, deltaMs: number, damping = 4.5): number => {
  if (deltaMs <= 0) return current;
  const alpha = 1 - Math.exp(-Math.max(0, damping) * Math.min(deltaMs, 64) / 1000);
  return current + (target - current) * alpha;
};

export const dampAmbientVector = (
  current: AmbientVector,
  target: AmbientVector,
  deltaMs: number
): AmbientVector => ({
  primaryX: dampAmbientValue(current.primaryX, target.primaryX, deltaMs),
  primaryY: dampAmbientValue(current.primaryY, target.primaryY, deltaMs),
  secondaryX: dampAmbientValue(current.secondaryX, target.secondaryX, deltaMs),
  secondaryY: dampAmbientValue(current.secondaryY, target.secondaryY, deltaMs),
  dotsX: dampAmbientValue(current.dotsX, target.dotsX, deltaMs),
  dotsY: dampAmbientValue(current.dotsY, target.dotsY, deltaMs)
});

export const ambientVectorsClose = (left: AmbientVector, right: AmbientVector, epsilon = .0005): boolean =>
  (Object.keys(left) as (keyof AmbientVector)[]).every(key => Math.abs(left[key] - right[key]) <= epsilon);
