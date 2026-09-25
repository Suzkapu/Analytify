import {InjectionToken} from '@angular/core';

export type DesignVariant = 'legacy' | 'new';

export const DESIGN_VARIANT = new InjectionToken<DesignVariant>('Analytify design variant', {
  providedIn: 'root',
  factory: () => 'legacy'
});

export type LogicalRouteId =
  | 'login'
  | 'callback'
  | 'playlists'
  | 'songs'
  | 'artistDetails'
  | 'analysis'
  | 'stats'
  | 'history'
  | 'admin'
  | 'songLeague'
  | 'songLeagueJoin'
  | 'sharedPlaylists'
  | 'sharedPlaylistClaim'
  | 'statsRequestClaim'
  | 'statsShareClaim'
  | 'compareRoom'
  | 'compareRoomJoin'
  | 'compareRoomCallback'
  | 'legal'
  | 'spotifyConnect'
  | 'spotifyCallback'
  | 'spotifyCloudAccess';

export interface LogicalRouteParameters {
  id?: string;
  userId?: string;
  leagueId?: string;
  token?: string;
  roomId?: string;
}

const ROUTES: Record<LogicalRouteId, readonly string[]> = {
  login: ['login'],
  callback: ['callback'],
  playlists: ['playlists'],
  songs: ['songs', ':id'],
  artistDetails: ['artistDetails', ':id'],
  analysis: ['analysis', ':id'],
  stats: ['stats', ':userId?'],
  history: ['history'],
  admin: ['admin'],
  songLeague: ['song-league', ':leagueId?'],
  songLeagueJoin: ['song-league', 'join', ':token'],
  sharedPlaylists: ['shared-playlists', ':id?'],
  sharedPlaylistClaim: ['shared-playlists', 'claim', ':token'],
  statsRequestClaim: ['shared-playlists', 'stats-request', ':token'],
  statsShareClaim: ['shared-playlists', 'stats-share', ':token'],
  compareRoom: ['compare-room'],
  compareRoomJoin: ['compare-room', 'join', ':roomId'],
  compareRoomCallback: ['compare-room', 'callback'],
  legal: ['legal'],
  spotifyConnect: ['spotify', 'connect'],
  spotifyCallback: ['spotify', 'callback'],
  spotifyCloudAccess: ['spotify', 'cloud-access']
};

export function resolveDesignRoute(
  variant: DesignVariant,
  destination: LogicalRouteId,
  parameters: LogicalRouteParameters = {}
): string[] {
  const segments = ROUTES[destination].flatMap(segment => {
    if (!segment.startsWith(':')) return [segment];
    const optional = segment.endsWith('?');
    const key = segment.slice(1, optional ? -1 : undefined) as keyof LogicalRouteParameters;
    const value = parameters[key];
    if (value == null || value === '') {
      if (optional) return [];
      throw new Error(`Missing route parameter: ${String(key)}`);
    }
    return [value];
  });
  if (variant === 'new') return ['/new', ...segments];
  return [`/${segments[0]}`, ...segments.slice(1)];
}

export function designVariantFromUrl(url: string): DesignVariant {
  return url === '/new' || url.startsWith('/new/') || url.startsWith('/new?') ? 'new' : 'legacy';
}
