export type SpotifyConnectionMode = 'hosted' | 'personal_pkce';

export interface PersonalSpotifyAuthRequest {
  clientId: string;
  state: string;
  verifier: string;
  returnUrl: string;
  expectedSpotifyId: string | null;
  createdAt: number;
}

