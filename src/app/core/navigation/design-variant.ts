import {InjectionToken} from '@angular/core';

export type DesignVariant = 'legacy' | 'new';

export const DESIGN_VARIANT = new InjectionToken<DesignVariant>('Analytify design variant', {
  providedIn: 'root',
  factory: () => 'legacy'
});

export const designCommands = (variant: DesignVariant, ...segments: string[]): string[] =>
  variant === 'new' ? ['/new', ...segments] : [`/${segments[0]}`, ...segments.slice(1)];

export const designPath = (variant: DesignVariant, ...segments: string[]): string =>
  designCommands(variant, ...segments).join('/');
