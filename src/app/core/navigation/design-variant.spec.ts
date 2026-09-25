import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {DESIGN_VARIANT, designCommands, designPath} from './design-variant';

describe('DesignVariant', () => {
  it('provides legacy as the application default', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(DESIGN_VARIANT)).toBe('legacy');
  });

  it('prefixes only the new design namespace', () => {
    expect(designCommands('legacy', 'stats')).toEqual(['/stats']);
    expect(designCommands('new', 'stats')).toEqual(['/new', 'stats']);
    expect(designPath('new', 'song-league', 'join', 'token')).toBe('/new/song-league/join/token');
  });
});
