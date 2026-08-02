import {CompareTrack} from '@core/compare-room/compare-room.models';

export interface PlaylistShare {
  id: string;
  ownerUserId: string;
  recipientUserId: string | null;
  sourcePlaylistId: string;
  playlistName: string;
  playlistDescription: string;
  playlistImageUrl: string;
  ownerDisplayName: string;
  ownerImageUrl: string;
  recipientDisplayName: string | null;
  trackCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface PlaylistShareDownload {
  shareId: string;
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string;
  appliedRevision: number;
  updatedAt: string;
}

export interface PlaylistShareDetails {
  share: PlaylistShare;
  tracks: CompareTrack[];
  download: PlaylistShareDownload | null;
  viewerRole: 'owner' | 'recipient';
}

export interface PlaylistSharePublication {
  sourcePlaylistId: string;
  playlistName: string;
  playlistDescription: string;
  playlistImageUrl: string;
  tracks: CompareTrack[];
}

export interface CreatedPlaylistShare {
  shareId: string;
  claimToken: string;
  claimUrl: string;
}

export interface SharedPlaylistStats {
  tracks: number;
  artists: number;
  albums: number;
  durationMs: number;
  explicitTracks: number;
  topArtists: Array<{id: string; name: string; count: number}>;
  topAlbums: Array<{name: string; count: number}>;
}
