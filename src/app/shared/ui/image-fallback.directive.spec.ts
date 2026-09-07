import {ElementRef} from '@angular/core';
import {describe, expect, it} from 'vitest';
import {ImageFallbackDirective} from './image-fallback.directive';

describe('ImageFallbackDirective', () => {
  it('replaces an unreachable remote image with an inline avatar without retrying the provider', () => {
    const image = document.createElement('img');
    image.src = 'https://platform-lookaside.fbsbx.com/profilepic';
    const directive = new ImageFallbackDirective(new ElementRef(image));

    directive.handleError();

    expect(image.src).toMatch(/^data:image\/svg\+xml/);
    expect(image.dataset['fallbackApplied']).toBe('true');
  });

  it('only applies its fallback once when the fallback itself cannot render', () => {
    const image = document.createElement('img');
    const directive = new ImageFallbackDirective(new ElementRef(image));
    directive.handleError();
    const fallback = image.src;

    directive.handleError();

    expect(image.src).toBe(fallback);
  });
});
