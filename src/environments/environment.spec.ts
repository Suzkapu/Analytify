import {environment} from './environment';

describe('production environment', () => {
  it('contains a deployable public Spotify client ID for Compare Room PKCE', () => {
    expect(environment.spotifyClientId).toMatch(/^[a-zA-Z0-9]{32}$/);
    expect(environment.spotifyClientId).not.toContain('REDACTED');
  });
});
