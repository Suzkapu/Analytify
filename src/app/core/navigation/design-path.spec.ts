import {describe, expect, it} from 'vitest';
import {designCommands, designPath} from './design-path';

describe('canonical design routes', () => {
  it('builds only canonical non-prefixed routes', () => {
    expect(designCommands('stats')).toEqual(['/stats']);
    expect(designCommands('song-league', 'join', 'token')).toEqual(['/song-league', 'join', 'token']);
    expect(designPath('song-league', 'join', 'token')).toBe('/song-league/join/token');
  });
});
