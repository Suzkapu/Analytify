export interface AmbientVector {
  primaryX: number;
  primaryY: number;
  secondaryX: number;
  secondaryY: number;
  dotsX: number;
  dotsY: number;
  intensity: number;
  dotIntensity: number;
}

export type AmbientOverlayState = 'none' | 'tools' | 'account' | 'settings' | 'modal';
export type AmbientShellMode = 'app' | 'focus' | 'public';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Canonical529:21518 ellipse centers. Asset dimensions remain intrinsic. */
export const ambientTargetForKey = (key: string, mobile = false): AmbientVector => {
  const scene = key.trim().toLowerCase();
  const centers: Record<string, readonly number[]> = {
    library: [.25, .15, .84, .58],
    insights: [.68, .3, .16, .72],
    social: [.4, .76, .83, .22],
    league: mobile
      ? [320 / 390, 110 / (2600 / 3), 45 / 390, 710 / (2600 / 3)]
      : [1120 / 1440, 145 / 810, 210 / 1440, 695 / 810]
  };
  const [primaryX, primaryY, secondaryX, secondaryY] = Object.hasOwn(centers, scene) ? centers[scene] : centers['library'];
  return {primaryX, primaryY, secondaryX, secondaryY, dotsX: 0, dotsY: 0, intensity: 1, dotIntensity: 1};
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
  const offset = clamp01(progress) * Math.min(1, Math.max(0, motionScale));
  return {
    primaryX: route.primaryX,
    primaryY: route.primaryY,
    secondaryX: route.secondaryX,
    secondaryY: route.secondaryY,
    dotsX: route.dotsX + offset * 1.8,
    dotsY: route.dotsY - offset * 2.4,
    intensity: route.intensity,
    dotIntensity: route.dotIntensity
  };
};

/** Overlay dimming preserves the route's glow coordinates; only particles may shift. */
export const ambientTargetWithInteraction = (
  target: AmbientVector,
  overlay: AmbientOverlayState,
  shellMode: AmbientShellMode
): AmbientVector => {
  const depth = overlay === 'none' ? 0 : overlay === 'modal' || overlay === 'settings' ? 1 : .62;
  const side = overlay === 'tools' ? -1 : overlay === 'account' ? 1 : 0;
  const shellIntensity = shellMode === 'app' ? 1 : shellMode === 'public' ? .86 : .76;
  return {
    primaryX: target.primaryX,
    primaryY: target.primaryY,
    secondaryX: target.secondaryX,
    secondaryY: target.secondaryY,
    dotsX: target.dotsX + side * depth * .22,
    dotsY: target.dotsY + depth * .12,
    intensity: shellIntensity * (1 - depth * .16),
    dotIntensity: shellIntensity * (1 - depth * .32)
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
  dotsY: dampAmbientValue(current.dotsY, target.dotsY, deltaMs),
  intensity: dampAmbientValue(current.intensity, target.intensity, deltaMs),
  dotIntensity: dampAmbientValue(current.dotIntensity, target.dotIntensity, deltaMs)
});

export const ambientVectorsClose = (left: AmbientVector, right: AmbientVector, epsilon = .0005): boolean =>
  (Object.keys(left) as (keyof AmbientVector)[]).every(key => Math.abs(left[key] - right[key]) <= epsilon);
