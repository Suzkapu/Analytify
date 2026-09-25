import {LogicalRouteId} from './design-navigation';

export type DesignV2NavigationGroup = 'main' | 'tools';

export interface DesignV2NavigationItem {
  id: string;
  label: string;
  icon: string;
  destination: LogicalRouteId;
  group: DesignV2NavigationGroup;
  mobilePrimary: boolean;
}

export const DESIGN_V2_NAVIGATION: readonly DesignV2NavigationItem[] = [
  {id: 'playlists', label: 'Playlists', icon: 'pi-list', destination: 'playlists', group: 'main', mobilePrimary: true},
  {id: 'stats', label: 'Stats', icon: 'pi-chart-bar', destination: 'stats', group: 'main', mobilePrimary: true},
  {id: 'history', label: 'History', icon: 'pi-history', destination: 'history', group: 'main', mobilePrimary: true},
  {id: 'song-league', label: 'Song Leagues', icon: 'pi-star', destination: 'songLeague', group: 'tools', mobilePrimary: false},
  {id: 'compare-room', label: 'Compare Room', icon: 'pi-clone', destination: 'compareRoom', group: 'tools', mobilePrimary: false},
  {id: 'private-sharing', label: 'Private Sharing', icon: 'pi-share-alt', destination: 'sharedPlaylists', group: 'tools', mobilePrimary: false}
] as const;

export const primaryDesignV2Navigation = (): readonly DesignV2NavigationItem[] =>
  DESIGN_V2_NAVIGATION.filter(item => item.group === 'main');

export const toolDesignV2Navigation = (): readonly DesignV2NavigationItem[] =>
  DESIGN_V2_NAVIGATION.filter(item => item.group === 'tools');

export const mobileDesignV2Navigation = (): readonly DesignV2NavigationItem[] =>
  DESIGN_V2_NAVIGATION.filter(item => item.mobilePrimary);
